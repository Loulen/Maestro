use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Severity {
    Warning,
    #[allow(dead_code)]
    Error,
}

#[derive(Debug, Clone)]
pub struct Diagnostic {
    #[allow(dead_code)]
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum NodeType {
    DocOnly,
    CodeMutating,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontmatterFieldDecl {
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(default)]
    pub allowed: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    pub name: String,
    #[serde(default)]
    pub repeated: bool,
    #[serde(default)]
    pub frontmatter: Option<HashMap<String, FrontmatterFieldDecl>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDef {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub prompt_file: Option<String>,
    #[serde(default)]
    pub inputs: Vec<Port>,
    #[serde(default)]
    pub outputs: Vec<Port>,
    #[serde(default)]
    pub interactive: bool,
    pub view: Option<ViewPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeEndpoint {
    pub node: String,
    pub port: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HaltTarget {
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub enum EdgeTarget {
    Node(EdgeEndpoint),
    Halt(HaltTarget),
}

impl Serialize for EdgeTarget {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            EdgeTarget::Node(ep) => ep.serialize(serializer),
            EdgeTarget::Halt(h) => {
                use serde::ser::SerializeMap;
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("halt", h)?;
                map.end()
            }
        }
    }
}

impl<'de> Deserialize<'de> for EdgeTarget {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = serde_yaml::Value::deserialize(deserializer)?;
        let mapping = value
            .as_mapping()
            .ok_or_else(|| serde::de::Error::custom("edge target must be a mapping"))?;

        let halt_key = serde_yaml::Value::String("halt".into());
        if let Some(halt_val) = mapping.get(&halt_key) {
            let message = halt_val
                .as_mapping()
                .and_then(|m| m.get(serde_yaml::Value::String("message".into())))
                .and_then(|v| v.as_str())
                .map(String::from);
            Ok(EdgeTarget::Halt(HaltTarget { message }))
        } else {
            let node = mapping
                .get(serde_yaml::Value::String("node".into()))
                .and_then(|v| v.as_str())
                .ok_or_else(|| serde::de::Error::custom("edge target missing 'node' field"))?
                .to_string();
            let port = mapping
                .get(serde_yaml::Value::String("port".into()))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(EdgeTarget::Node(EdgeEndpoint { node, port }))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeDef {
    pub source: EdgeEndpoint,
    pub target: EdgeTarget,
    #[serde(default)]
    pub when: Option<serde_yaml::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum VariableType {
    Int,
    Float,
    String,
    Bool,
    List,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableDef {
    #[serde(rename = "type")]
    pub var_type: VariableType,
    pub default: serde_yaml::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDef {
    pub name: String,
    pub version: Option<String>,
    #[serde(default, deserialize_with = "deserialize_variables")]
    pub variables: HashMap<String, VariableDef>,
    #[serde(default)]
    pub nodes: Vec<NodeDef>,
    #[serde(default)]
    pub edges: Vec<EdgeDef>,
}

fn infer_variable_type(val: &serde_yaml::Value) -> VariableType {
    match val {
        serde_yaml::Value::Bool(_) => VariableType::Bool,
        serde_yaml::Value::Number(n) => {
            if n.is_f64() && !n.is_i64() && !n.is_u64() {
                VariableType::Float
            } else {
                VariableType::Int
            }
        }
        serde_yaml::Value::Sequence(_) => VariableType::List,
        _ => VariableType::String,
    }
}

fn deserialize_variables<'de, D>(deserializer: D) -> Result<HashMap<String, VariableDef>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw: HashMap<String, serde_yaml::Value> = HashMap::deserialize(deserializer)?;
    let mut result = HashMap::new();

    for (name, value) in raw {
        let is_explicit = value.as_mapping().is_some_and(|m| {
            m.contains_key(serde_yaml::Value::String("type".into()))
                && m.contains_key(serde_yaml::Value::String("default".into()))
        });
        let var_def = if is_explicit {
            serde_yaml::from_value::<VariableDef>(value).map_err(serde::de::Error::custom)?
        } else {
            VariableDef {
                var_type: infer_variable_type(&value),
                default: value,
            }
        };
        result.insert(name, var_def);
    }

    Ok(result)
}

impl PipelineDef {
    pub fn variable_defaults(&self) -> HashMap<String, serde_yaml::Value> {
        self.variables
            .iter()
            .map(|(k, v)| (k.clone(), v.default.clone()))
            .collect()
    }
}

#[derive(Debug)]
pub struct ParseResult {
    pub pipeline: PipelineDef,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("invalid YAML: {0}")]
    InvalidYaml(#[from] serde_yaml::Error),
    #[error("missing required field: {0}")]
    MissingField(String),
}

pub fn parse_pipeline(yaml: &str) -> Result<ParseResult, ParseError> {
    let mut raw: serde_yaml::Value = serde_yaml::from_str(yaml)?;

    if raw
        .as_mapping()
        .ok_or_else(|| ParseError::MissingField("root must be a mapping".into()))?
        .get(serde_yaml::Value::String("name".into()))
        .is_none()
    {
        return Err(ParseError::MissingField("name".into()));
    }

    let mut diagnostics = Vec::new();
    let valid_types = ["doc-only", "code-mutating"];

    if let Some(nodes) = raw
        .as_mapping_mut()
        .and_then(|m| m.get_mut(serde_yaml::Value::String("nodes".into())))
        .and_then(|v| v.as_sequence_mut())
    {
        for node_val in nodes.iter_mut() {
            if let Some(node_map) = node_val.as_mapping_mut() {
                let type_key = serde_yaml::Value::String("type".into());
                let node_id = node_map
                    .get(serde_yaml::Value::String("id".into()))
                    .and_then(|v| v.as_str())
                    .unwrap_or("<unknown>")
                    .to_string();

                match node_map.get(&type_key).and_then(|v| v.as_str()) {
                    None => {
                        diagnostics.push(Diagnostic {
                            severity: Severity::Warning,
                            message: format!(
                                "node '{node_id}': missing 'type', defaulting to 'doc-only'"
                            ),
                        });
                        node_map.insert(type_key, serde_yaml::Value::String("doc-only".into()));
                    }
                    Some(t) if !valid_types.contains(&t) => {
                        diagnostics.push(Diagnostic {
                            severity: Severity::Warning,
                            message: format!(
                                "node '{node_id}': unknown node type '{t}', defaulting to 'doc-only'"
                            ),
                        });
                        node_map.insert(type_key, serde_yaml::Value::String("doc-only".into()));
                    }
                    _ => {}
                }
            }
        }
    }

    let pipeline: PipelineDef = serde_yaml::from_value(raw.clone())?;

    let known_keys: &[&str] = &["name", "version", "variables", "nodes", "edges"];
    if let Some(mapping) = raw.as_mapping() {
        for key in mapping.keys() {
            if let Some(k) = key.as_str() {
                if !known_keys.contains(&k) {
                    diagnostics.push(Diagnostic {
                        severity: Severity::Warning,
                        message: format!("unknown field '{k}' (ignored)"),
                    });
                }
            }
        }
    }

    for node in &pipeline.nodes {
        if node.prompt_file.is_none() {
            diagnostics.push(Diagnostic {
                severity: Severity::Warning,
                message: format!("node '{}': missing prompt_file", node.id),
            });
        }
    }

    let node_ids: std::collections::HashSet<&str> =
        pipeline.nodes.iter().map(|n| n.id.as_str()).collect();

    let check_endpoint = |endpoint: &EdgeEndpoint,
                          role: &str,
                          get_ports: fn(&NodeDef) -> &[Port]|
     -> Option<Diagnostic> {
        if !node_ids.contains(endpoint.node.as_str()) {
            return Some(Diagnostic {
                severity: Severity::Warning,
                message: format!(
                    "edge {role} references non-existent node '{}'",
                    endpoint.node
                ),
            });
        }
        let node = pipeline
            .nodes
            .iter()
            .find(|n| n.id == endpoint.node)
            .unwrap();
        if !get_ports(node).iter().any(|p| p.name == endpoint.port) {
            return Some(Diagnostic {
                severity: Severity::Warning,
                message: format!(
                    "edge {role} port '{}' not found on node '{}'",
                    endpoint.port, endpoint.node
                ),
            });
        }
        None
    };

    for edge in &pipeline.edges {
        if let Some(d) = check_endpoint(&edge.source, "source", |n| &n.outputs) {
            diagnostics.push(d);
        }
        if let EdgeTarget::Node(ref ep) = edge.target {
            if let Some(d) = check_endpoint(ep, "target", |n| &n.inputs) {
                diagnostics.push(d);
            }
        }
    }

    Ok(ParseResult {
        pipeline,
        diagnostics,
    })
}

pub fn load_prompt_file(pipeline_dir: &Path, prompt_file: &str) -> Result<String, std::io::Error> {
    let path = pipeline_dir.join(prompt_file);
    std::fs::read_to_string(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    const VALID_MINIMAL: &str = r#"
name: test-pipeline
version: "1.0"
nodes:
  - id: planner
    type: doc-only
    prompt_file: prompts/planner.md
    inputs:
      - name: task
    outputs:
      - name: plan
"#;

    #[test]
    fn parses_valid_minimal_pipeline() {
        let result = parse_pipeline(VALID_MINIMAL).unwrap();
        assert_eq!(result.pipeline.name, "test-pipeline");
        assert_eq!(result.pipeline.version.as_deref(), Some("1.0"));
        assert_eq!(result.pipeline.nodes.len(), 1);

        let node = &result.pipeline.nodes[0];
        assert_eq!(node.id, "planner");
        assert_eq!(node.node_type, NodeType::DocOnly);
        assert_eq!(node.prompt_file.as_deref(), Some("prompts/planner.md"));
        assert_eq!(node.inputs.len(), 1);
        assert_eq!(node.inputs[0].name, "task");
        assert_eq!(node.outputs.len(), 1);
        assert_eq!(node.outputs[0].name, "plan");

        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn warns_on_missing_prompt_file() {
        let yaml = r#"
name: no-prompt
nodes:
  - id: worker
    type: doc-only
    inputs:
      - name: in
    outputs:
      - name: out
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].severity, Severity::Warning);
        assert!(result.diagnostics[0]
            .message
            .contains("missing prompt_file"));
    }

    #[test]
    fn errors_on_invalid_yaml() {
        let yaml = "{{not: valid: yaml:::";
        let err = parse_pipeline(yaml).unwrap_err();
        assert!(matches!(err, ParseError::InvalidYaml(_)));
    }

    #[test]
    fn warns_on_unknown_fields() {
        let yaml = r#"
name: with-extras
custom_field: hello
another_unknown: 42
nodes: []
"#;
        let result = parse_pipeline(yaml).unwrap();
        let warnings: Vec<&str> = result
            .diagnostics
            .iter()
            .map(|d| d.message.as_str())
            .collect();
        assert!(warnings.iter().any(|w| w.contains("custom_field")));
        assert!(warnings.iter().any(|w| w.contains("another_unknown")));
    }

    #[test]
    fn unknown_type_defaults_to_doc_only_with_warning() {
        let yaml = r#"
name: bad-type
nodes:
  - id: x
    type: transformer
    prompt_file: x.md
    inputs: []
    outputs: []
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.pipeline.nodes[0].node_type, NodeType::DocOnly);
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("unknown node type 'transformer'")));
    }

    #[test]
    fn missing_type_defaults_to_doc_only_with_warning() {
        let yaml = r#"
name: no-type
nodes:
  - id: x
    prompt_file: x.md
    inputs: []
    outputs: []
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.pipeline.nodes[0].node_type, NodeType::DocOnly);
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("missing 'type'")));
    }

    #[test]
    fn errors_on_missing_name() {
        let yaml = r#"
version: "1.0"
nodes: []
"#;
        let err = parse_pipeline(yaml).unwrap_err();
        assert!(matches!(err, ParseError::MissingField(_)));
    }

    #[test]
    fn parses_interactive_node() {
        let yaml = r#"
name: interactive-pipe
nodes:
  - id: griller
    type: doc-only
    prompt_file: prompts/griller.md
    interactive: true
    inputs:
      - name: task
    outputs:
      - name: brief
  - id: worker
    type: code-mutating
    prompt_file: prompts/worker.md
    inputs:
      - name: brief
    outputs:
      - name: summary
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert!(result.pipeline.nodes[0].interactive);
        assert!(!result.pipeline.nodes[1].interactive);
    }

    #[test]
    fn interactive_defaults_to_false() {
        let result = parse_pipeline(VALID_MINIMAL).unwrap();
        assert!(!result.pipeline.nodes[0].interactive);
    }

    #[test]
    fn parses_typed_variables_explicit_form() {
        let yaml = r#"
name: typed-vars
variables:
  max_iter:
    type: int
    default: 5
  mode:
    type: string
    default: strict
  verbose:
    type: bool
    default: true
nodes: []
"#;
        let result = parse_pipeline(yaml).unwrap();
        let vars = &result.pipeline.variables;
        assert_eq!(vars.len(), 3);
        assert_eq!(vars["max_iter"].var_type, VariableType::Int);
        assert_eq!(
            vars["max_iter"].default,
            serde_yaml::Value::Number(serde_yaml::Number::from(5))
        );
        assert_eq!(vars["mode"].var_type, VariableType::String);
        assert_eq!(
            vars["mode"].default,
            serde_yaml::Value::String("strict".into())
        );
        assert_eq!(vars["verbose"].var_type, VariableType::Bool);
        assert_eq!(vars["verbose"].default, serde_yaml::Value::Bool(true));
    }

    #[test]
    fn parses_variables_inferred_type_from_value() {
        let yaml = r#"
name: inferred-vars
variables:
  max_iter: 5
  threshold: 0.8
  mode: strict
  verbose: true
  tags: [a, b, c]
nodes: []
"#;
        let result = parse_pipeline(yaml).unwrap();
        let vars = &result.pipeline.variables;
        assert_eq!(vars["max_iter"].var_type, VariableType::Int);
        assert_eq!(vars["threshold"].var_type, VariableType::Float);
        assert_eq!(vars["mode"].var_type, VariableType::String);
        assert_eq!(vars["verbose"].var_type, VariableType::Bool);
        assert_eq!(vars["tags"].var_type, VariableType::List);
    }

    #[test]
    fn variable_defaults_extracts_values() {
        let yaml = r#"
name: defaults-test
variables:
  max_iter: 5
  threshold: 0.8
nodes: []
"#;
        let result = parse_pipeline(yaml).unwrap();
        let defaults = result.pipeline.variable_defaults();
        assert_eq!(
            defaults["max_iter"],
            serde_yaml::Value::Number(serde_yaml::Number::from(5))
        );
    }

    #[test]
    fn parses_pipeline_with_edges_and_variables() {
        let yaml = r#"
name: full-pipeline
version: "2.0"
variables:
  max_iter: 5
  threshold: 0.8
nodes:
  - id: planner
    type: doc-only
    prompt_file: prompts/planner.md
    inputs:
      - name: task
    outputs:
      - name: plan
  - id: implementer
    type: code-mutating
    prompt_file: prompts/implementer.md
    inputs:
      - name: plan
    outputs:
      - name: summary
edges:
  - source: { node: planner, port: plan }
    target: { node: implementer, port: plan }
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.pipeline.nodes.len(), 2);
        assert_eq!(result.pipeline.edges.len(), 1);
        assert_eq!(result.pipeline.variables.len(), 2);
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn warns_on_edge_to_nonexistent_node() {
        let yaml = r#"
name: bad-edge
nodes:
  - id: planner
    type: doc-only
    prompt_file: p.md
    outputs:
      - name: plan
edges:
  - source: { node: planner, port: plan }
    target: { node: ghost, port: plan }
"#;
        let result = parse_pipeline(yaml).unwrap();
        let warnings: Vec<&str> = result
            .diagnostics
            .iter()
            .map(|d| d.message.as_str())
            .collect();
        assert!(warnings
            .iter()
            .any(|w| w.contains("non-existent node 'ghost'")));
        assert!(result
            .diagnostics
            .iter()
            .all(|d| d.severity == Severity::Warning));
    }

    #[test]
    fn warns_on_port_name_typo() {
        let yaml = r#"
name: bad-port
nodes:
  - id: planner
    type: doc-only
    prompt_file: p.md
    outputs:
      - name: plan
  - id: implementer
    type: doc-only
    prompt_file: p.md
    inputs:
      - name: plan
edges:
  - source: { node: planner, port: plaan }
    target: { node: implementer, port: plaan }
"#;
        let result = parse_pipeline(yaml).unwrap();
        let warnings: Vec<&str> = result
            .diagnostics
            .iter()
            .map(|d| d.message.as_str())
            .collect();
        assert!(warnings
            .iter()
            .any(|w| w.contains("source port 'plaan' not found")));
        assert!(warnings
            .iter()
            .any(|w| w.contains("target port 'plaan' not found")));
    }

    #[test]
    fn no_warning_on_cycle_in_topology() {
        let yaml = r#"
name: cycle
nodes:
  - id: implementer
    type: doc-only
    prompt_file: p.md
    inputs:
      - name: review
    outputs:
      - name: code
  - id: reviewer
    type: doc-only
    prompt_file: p.md
    inputs:
      - name: code
    outputs:
      - name: review
edges:
  - source: { node: implementer, port: code }
    target: { node: reviewer, port: code }
  - source: { node: reviewer, port: review }
    target: { node: implementer, port: review }
"#;
        let result = parse_pipeline(yaml).unwrap();
        let non_prompt_warnings: Vec<&str> = result
            .diagnostics
            .iter()
            .filter(|d| !d.message.contains("prompt_file"))
            .map(|d| d.message.as_str())
            .collect();
        assert!(
            non_prompt_warnings.is_empty(),
            "cycle should not produce warnings, got: {non_prompt_warnings:?}"
        );
    }

    #[test]
    fn parses_nodes_with_view_positions() {
        let yaml = r#"
name: with-view
nodes:
  - id: planner
    type: doc-only
    prompt_file: p.md
    view: { x: 100, y: 200 }
    outputs:
      - name: plan
"#;
        let result = parse_pipeline(yaml).unwrap();
        let node = &result.pipeline.nodes[0];
        let view = node.view.as_ref().unwrap();
        assert_eq!(view.x, 100.0);
        assert_eq!(view.y, 200.0);
    }

    #[test]
    fn parses_edge_with_when_clause() {
        let yaml = r#"
name: conditional
nodes:
  - id: reviewer
    type: doc-only
    prompt_file: p.md
    outputs:
      - name: review
  - id: implementer
    type: code-mutating
    prompt_file: p.md
    inputs:
      - name: review
    outputs:
      - name: code
edges:
  - source: { node: reviewer, port: review }
    target: { node: implementer, port: review }
    when:
      iter: { lt: 5 }
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.pipeline.edges.len(), 1);
        let edge = &result.pipeline.edges[0];
        assert!(edge.when.is_some());
        let when = edge.when.as_ref().unwrap();
        assert!(when.as_mapping().unwrap().contains_key("iter"));
    }

    #[test]
    fn parses_halt_target_edge() {
        let yaml = r#"
name: with-halt
nodes:
  - id: reviewer
    type: doc-only
    prompt_file: p.md
    outputs:
      - name: review
edges:
  - source: { node: reviewer, port: review }
    target: { halt: { message: "Blocked after {iter} iterations" } }
    when:
      iter: { gte: 5 }
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.pipeline.edges.len(), 1);
        let edge = &result.pipeline.edges[0];
        assert!(
            matches!(&edge.target, EdgeTarget::Halt(h) if h.message.as_deref() == Some("Blocked after {iter} iterations"))
        );
        assert!(edge.when.is_some());
    }

    #[test]
    fn parses_halt_target_without_message() {
        let yaml = r#"
name: halt-no-msg
nodes:
  - id: worker
    type: doc-only
    prompt_file: p.md
    outputs:
      - name: out
edges:
  - source: { node: worker, port: out }
    target: { halt: {} }
"#;
        let result = parse_pipeline(yaml).unwrap();
        let edge = &result.pipeline.edges[0];
        assert!(matches!(&edge.target, EdgeTarget::Halt(h) if h.message.is_none()));
    }

    #[test]
    fn halt_target_not_validated_as_node() {
        let yaml = r#"
name: halt-no-warning
nodes:
  - id: reviewer
    type: doc-only
    prompt_file: p.md
    outputs:
      - name: review
edges:
  - source: { node: reviewer, port: review }
    target: { halt: { message: "stopped" } }
"#;
        let result = parse_pipeline(yaml).unwrap();
        let non_prompt_warnings: Vec<&str> = result
            .diagnostics
            .iter()
            .filter(|d| !d.message.contains("prompt_file"))
            .map(|d| d.message.as_str())
            .collect();
        assert!(
            non_prompt_warnings.is_empty(),
            "halt target should not produce validation warnings, got: {non_prompt_warnings:?}"
        );
    }

    #[test]
    fn parses_multiple_nodes_with_multiple_ports() {
        let yaml = r#"
name: multi-port
nodes:
  - id: planner
    type: doc-only
    prompt_file: p.md
    inputs:
      - name: task
    outputs:
      - name: plan
      - name: task_list
  - id: implementer
    type: code-mutating
    prompt_file: p.md
    inputs:
      - name: plan
      - name: task_list
    outputs:
      - name: summary
  - id: reviewer
    type: doc-only
    prompt_file: p.md
    inputs:
      - name: summary
    outputs:
      - name: review
edges:
  - source: { node: planner, port: plan }
    target: { node: implementer, port: plan }
  - source: { node: planner, port: task_list }
    target: { node: implementer, port: task_list }
  - source: { node: implementer, port: summary }
    target: { node: reviewer, port: summary }
"#;
        let result = parse_pipeline(yaml).unwrap();
        assert_eq!(result.pipeline.nodes.len(), 3);
        assert_eq!(result.pipeline.edges.len(), 3);
        assert_eq!(result.pipeline.nodes[0].outputs.len(), 2);
        assert_eq!(result.pipeline.nodes[1].inputs.len(), 2);
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn parses_output_port_with_frontmatter_schema() {
        let yaml = r#"
name: with-schema
nodes:
  - id: reviewer
    type: doc-only
    prompt_file: p.md
    inputs:
      - name: code
    outputs:
      - name: review
        frontmatter:
          verdict:
            type: enum
            allowed: [PASS, FAIL]
          score:
            type: int
"#;
        let result = parse_pipeline(yaml).unwrap();
        let port = &result.pipeline.nodes[0].outputs[0];
        assert_eq!(port.name, "review");
        let schema = port.frontmatter.as_ref().unwrap();
        assert_eq!(schema.len(), 2);
        assert_eq!(schema["verdict"].field_type, "enum");
        assert_eq!(
            schema["verdict"].allowed,
            Some(vec!["PASS".into(), "FAIL".into()])
        );
        assert_eq!(schema["score"].field_type, "int");
        assert!(schema["score"].allowed.is_none());
    }

    #[test]
    fn output_port_without_frontmatter_has_none() {
        let result = parse_pipeline(VALID_MINIMAL).unwrap();
        let port = &result.pipeline.nodes[0].outputs[0];
        assert!(port.frontmatter.is_none());
    }
}
