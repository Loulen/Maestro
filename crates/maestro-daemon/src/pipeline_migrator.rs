use std::collections::HashMap;
use std::path::Path;

use tracing::{info, warn};

use crate::pipeline;

const NANOID_ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const NANOID_LEN: usize = 8;

fn deterministic_id(old_id: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in old_id.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let mut out = String::with_capacity(NANOID_LEN);
    for i in 0..NANOID_LEN {
        let idx = ((hash >> (i * 8)) & 0xFF) as usize % NANOID_ALPHABET.len();
        out.push(NANOID_ALPHABET[idx] as char);
    }
    out
}

fn looks_like_nanoid(id: &str) -> bool {
    id.len() == NANOID_LEN && id.bytes().all(|b| NANOID_ALPHABET.contains(&b))
}

fn port_missing_side(ports: &[serde_yaml::Value]) -> bool {
    ports.iter().any(|p| {
        p.as_mapping()
            .is_some_and(|m| !m.contains_key(serde_yaml::Value::String("side".into())))
    })
}

fn needs_migration(yaml_value: &serde_yaml::Value) -> bool {
    let nodes = match yaml_value.get("nodes").and_then(|n| n.as_sequence()) {
        Some(seq) => seq,
        None => return false,
    };
    for node in nodes {
        if node.get("prompt_file").and_then(|v| v.as_str()).is_some() {
            return true;
        }
        if let Some(id) = node.get("id").and_then(|v| v.as_str()) {
            if !looks_like_nanoid(id) {
                return true;
            }
        }
        if let Some(inputs) = node.get("inputs").and_then(|v| v.as_sequence()) {
            if port_missing_side(inputs) {
                return true;
            }
        }
        if let Some(outputs) = node.get("outputs").and_then(|v| v.as_sequence()) {
            if port_missing_side(outputs) {
                return true;
            }
        }
    }
    false
}

pub struct MigrateResult {
    pub migrated: bool,
    pub yaml_text: String,
    pub prompt_moves: Vec<(String, String)>,
}

pub fn migrate_pipeline_yaml(
    yaml_text: &str,
    pipeline_path: &Path,
) -> Result<MigrateResult, String> {
    let mut doc: serde_yaml::Value =
        serde_yaml::from_str(yaml_text).map_err(|e| format!("YAML parse error: {e}"))?;

    if !needs_migration(&doc) {
        return Ok(MigrateResult {
            migrated: false,
            yaml_text: yaml_text.to_string(),
            prompt_moves: vec![],
        });
    }

    let pipeline_dir = pipeline_path.parent().unwrap_or(Path::new("."));

    let nodes = doc
        .get_mut("nodes")
        .and_then(|n| n.as_sequence_mut())
        .ok_or("missing 'nodes' sequence")?;

    let mut id_map: HashMap<String, String> = HashMap::new();
    let mut prompt_moves: Vec<(String, String)> = Vec::new();

    for node in nodes.iter_mut() {
        let mapping = node.as_mapping_mut().ok_or("node is not a mapping")?;

        let old_id = mapping
            .get(serde_yaml::Value::String("id".into()))
            .and_then(|v| v.as_str())
            .ok_or("node missing 'id'")?
            .to_string();

        if looks_like_nanoid(&old_id)
            && mapping
                .get(serde_yaml::Value::String("name".into()))
                .is_some()
        {
            continue;
        }

        let new_id = deterministic_id(&old_id);
        id_map.insert(old_id.clone(), new_id.clone());

        mapping.insert(
            serde_yaml::Value::String("id".into()),
            serde_yaml::Value::String(new_id.clone()),
        );

        if mapping
            .get(serde_yaml::Value::String("name".into()))
            .is_none()
        {
            mapping.insert(
                serde_yaml::Value::String("name".into()),
                serde_yaml::Value::String(old_id.clone()),
            );
        }

        if let Some(pf) = mapping
            .remove(serde_yaml::Value::String("prompt_file".into()))
            .and_then(|v| v.as_str().map(String::from))
        {
            let old_path = pipeline_dir.join(&pf);
            let new_path = pipeline::canonical_prompt_path(pipeline_path, &new_id);
            if old_path.to_string_lossy() != new_path.to_string_lossy() {
                prompt_moves.push((
                    old_path.to_string_lossy().into_owned(),
                    new_path.to_string_lossy().into_owned(),
                ));
            }
        }
    }

    let edges = doc.get_mut("edges").and_then(|e| e.as_sequence_mut());

    if let Some(edges) = edges {
        for edge in edges.iter_mut() {
            rewrite_edge_endpoint(edge, "source", &id_map);
            rewrite_edge_endpoint(edge, "target", &id_map);
        }
    }

    let nodes_for_side = doc.get_mut("nodes").and_then(|n| n.as_sequence_mut());
    if let Some(nodes_for_side) = nodes_for_side {
        for node in nodes_for_side.iter_mut() {
            backfill_port_sides(node, "inputs", "left");
            backfill_port_sides(node, "outputs", "right");
        }
    }

    let yaml_text =
        serde_yaml::to_string(&doc).map_err(|e| format!("YAML serialize error: {e}"))?;

    Ok(MigrateResult {
        migrated: true,
        yaml_text,
        prompt_moves,
    })
}

fn backfill_port_sides(node: &mut serde_yaml::Value, key: &str, default_side: &str) {
    let ports = match node.get_mut(key).and_then(|v| v.as_sequence_mut()) {
        Some(seq) => seq,
        None => return,
    };
    let side_key = serde_yaml::Value::String("side".into());
    for port in ports.iter_mut() {
        if let Some(m) = port.as_mapping_mut() {
            if !m.contains_key(&side_key) {
                m.insert(
                    side_key.clone(),
                    serde_yaml::Value::String(default_side.into()),
                );
            }
        }
    }
}

fn rewrite_edge_endpoint(
    edge: &mut serde_yaml::Value,
    key: &str,
    id_map: &HashMap<String, String>,
) {
    if let Some(ep) = edge.get_mut(key).and_then(|v| v.as_mapping_mut()) {
        let node_key = serde_yaml::Value::String("node".into());
        if let Some(old) = ep.get(&node_key).and_then(|v| v.as_str()).map(String::from) {
            if let Some(new_id) = id_map.get(&old) {
                ep.insert(node_key, serde_yaml::Value::String(new_id.clone()));
            }
        }
    }
}

pub fn migrate_pipeline_file(pipeline_path: &Path) -> Result<bool, String> {
    let yaml_text = std::fs::read_to_string(pipeline_path)
        .map_err(|e| format!("read {}: {e}", pipeline_path.display()))?;

    let result = migrate_pipeline_yaml(&yaml_text, pipeline_path)?;
    if !result.migrated {
        return Ok(false);
    }

    for (src, dst) in &result.prompt_moves {
        let dst_path = Path::new(dst);
        if let Some(parent) = dst_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
        }
        let src_path = Path::new(src);
        if src_path.exists() {
            std::fs::rename(src_path, dst_path)
                .map_err(|e| format!("rename {} -> {}: {e}", src, dst))?;
            info!(from = %src, to = %dst, "moved prompt file");
        }
    }

    std::fs::write(pipeline_path, &result.yaml_text)
        .map_err(|e| format!("write {}: {e}", pipeline_path.display()))?;

    info!(path = %pipeline_path.display(), "migrated pipeline YAML");
    Ok(true)
}

pub fn migrate_all(pipelines_dir: &Path) -> Result<usize, String> {
    let mut count = 0;
    let entries = std::fs::read_dir(pipelines_dir)
        .map_err(|e| format!("read dir {}: {e}", pipelines_dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let path = entry.path();
        let is_yaml = path
            .extension()
            .is_some_and(|ext| ext == "yaml" || ext == "yml");
        if !is_yaml {
            continue;
        }
        match migrate_pipeline_file(&path) {
            Ok(true) => count += 1,
            Ok(false) => {}
            Err(e) => warn!(path = %path.display(), error = %e, "skipped pipeline migration"),
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_id_is_stable() {
        let a = deterministic_id("implementer");
        let b = deterministic_id("implementer");
        assert_eq!(a, b);
        assert_eq!(a.len(), NANOID_LEN);
        assert!(a.bytes().all(|b| NANOID_ALPHABET.contains(&b)));
    }

    #[test]
    fn deterministic_id_differs_for_different_inputs() {
        let a = deterministic_id("implementer");
        let b = deterministic_id("reviewer");
        assert_ne!(a, b);
    }

    #[test]
    fn looks_like_nanoid_accepts_valid() {
        assert!(looks_like_nanoid("aBcD1234"));
        assert!(looks_like_nanoid("00000000"));
    }

    #[test]
    fn looks_like_nanoid_rejects_invalid() {
        assert!(!looks_like_nanoid("implementer"));
        assert!(!looks_like_nanoid("ab-cd_12"));
        assert!(!looks_like_nanoid("short"));
        assert!(!looks_like_nanoid(""));
    }

    #[test]
    fn idempotent_on_already_migrated() {
        let yaml = r#"
name: test
version: "1.0"
nodes:
  - id: aBcD1234
    name: implementer
    type: code-mutating
    inputs:
      - name: review
        side: left
    outputs:
      - name: code
        side: right
    view: { x: 100, y: 160 }
edges: []
"#;
        let result = migrate_pipeline_yaml(yaml, Path::new("/tmp/test.yaml")).unwrap();
        assert!(!result.migrated);
    }

    #[test]
    fn migrates_old_format_nodes() {
        let yaml = r#"
name: review-loop
version: "1.0"
nodes:
  - id: implementer
    type: code-mutating
    prompt_file: .maestro/prompts/implementer.md
    inputs:
      - name: review
    outputs:
      - name: code
    view: { x: 100, y: 160 }
  - id: reviewer
    type: doc-only
    prompt_file: .maestro/prompts/reviewer.md
    inputs:
      - name: code
    outputs:
      - name: review
    view: { x: 500, y: 160 }
edges:
  - source: { node: implementer, port: code }
    target: { node: reviewer, port: code }
  - source: { node: reviewer, port: review }
    target: { node: implementer, port: review }
    when:
      iter: { lt: 3 }
"#;
        let result = migrate_pipeline_yaml(yaml, Path::new("/pipelines/review-loop.yaml")).unwrap();
        assert!(result.migrated);

        let new_impl_id = deterministic_id("implementer");
        let new_rev_id = deterministic_id("reviewer");

        let parsed: serde_yaml::Value = serde_yaml::from_str(&result.yaml_text).unwrap();

        let nodes = parsed["nodes"].as_sequence().unwrap();
        assert_eq!(nodes[0]["id"].as_str().unwrap(), new_impl_id);
        assert_eq!(nodes[0]["name"].as_str().unwrap(), "implementer");
        assert!(nodes[0].get("prompt_file").is_none());
        assert_eq!(nodes[1]["id"].as_str().unwrap(), new_rev_id);
        assert_eq!(nodes[1]["name"].as_str().unwrap(), "reviewer");

        let edges = parsed["edges"].as_sequence().unwrap();
        assert_eq!(edges[0]["source"]["node"].as_str().unwrap(), new_impl_id);
        assert_eq!(edges[0]["target"]["node"].as_str().unwrap(), new_rev_id);
        assert_eq!(edges[1]["source"]["node"].as_str().unwrap(), new_rev_id);
        assert_eq!(edges[1]["target"]["node"].as_str().unwrap(), new_impl_id);

        assert_eq!(result.prompt_moves.len(), 2);
    }

    #[test]
    fn migrates_edges_with_halt_target() {
        let yaml = r#"
name: test
version: "1.0"
nodes:
  - id: worker
    type: doc-only
    inputs: []
    outputs:
      - name: out
edges:
  - source: { node: worker, port: out }
    target:
      halt: { message: "done" }
"#;
        let result = migrate_pipeline_yaml(yaml, Path::new("/pipelines/test.yaml")).unwrap();
        assert!(result.migrated);

        let parsed: serde_yaml::Value = serde_yaml::from_str(&result.yaml_text).unwrap();

        let new_id = deterministic_id("worker");
        let edges = parsed["edges"].as_sequence().unwrap();
        assert_eq!(edges[0]["source"]["node"].as_str().unwrap(), new_id);
        assert!(edges[0]["target"]["halt"].is_mapping());
    }

    #[test]
    fn prompt_moves_use_canonical_path() {
        let yaml = r#"
name: demo
version: "1.0"
nodes:
  - id: agent
    type: doc-only
    prompt_file: old/path/agent.md
    inputs: []
    outputs: []
edges: []
"#;
        let result = migrate_pipeline_yaml(yaml, Path::new("/pipelines/demo.yaml")).unwrap();
        assert!(result.migrated);
        assert_eq!(result.prompt_moves.len(), 1);

        let new_id = deterministic_id("agent");
        let expected_dst = format!("/pipelines/demo.prompts/{new_id}.md");
        assert_eq!(result.prompt_moves[0].0, "/pipelines/old/path/agent.md");
        assert_eq!(result.prompt_moves[0].1, expected_dst);
    }

    #[test]
    fn backfills_port_side_defaults() {
        let yaml = r#"
name: test
version: "1.0"
nodes:
  - id: aBcD1234
    name: worker
    type: doc-only
    inputs:
      - name: task
      - name: context
    outputs:
      - name: plan
      - name: summary
edges: []
"#;
        let result = migrate_pipeline_yaml(yaml, Path::new("/tmp/test.yaml")).unwrap();
        assert!(result.migrated);

        let parsed: serde_yaml::Value = serde_yaml::from_str(&result.yaml_text).unwrap();
        let nodes = parsed["nodes"].as_sequence().unwrap();
        let inputs = nodes[0]["inputs"].as_sequence().unwrap();
        let outputs = nodes[0]["outputs"].as_sequence().unwrap();

        assert_eq!(inputs[0]["side"].as_str().unwrap(), "left");
        assert_eq!(inputs[1]["side"].as_str().unwrap(), "left");
        assert_eq!(outputs[0]["side"].as_str().unwrap(), "right");
        assert_eq!(outputs[1]["side"].as_str().unwrap(), "right");
    }

    #[test]
    fn preserves_existing_port_side() {
        let yaml = r#"
name: test
version: "1.0"
nodes:
  - id: aBcD1234
    name: worker
    type: doc-only
    inputs:
      - name: task
        side: bottom
    outputs:
      - name: plan
        side: top
edges: []
"#;
        let result = migrate_pipeline_yaml(yaml, Path::new("/tmp/test.yaml")).unwrap();
        assert!(!result.migrated);
    }

    #[test]
    fn migrate_file_on_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let yaml_path = tmp.path().join("test.yaml");
        let old_prompt_dir = tmp.path().join("old_prompts");
        std::fs::create_dir_all(&old_prompt_dir).unwrap();
        std::fs::write(old_prompt_dir.join("mynode.md"), "hello prompt").unwrap();

        let yaml = "name: test\nversion: '1.0'\nnodes:\n  - id: mynode\n    type: doc-only\n    prompt_file: old_prompts/mynode.md\n    inputs: []\n    outputs: []\nedges: []\n".to_string();
        std::fs::write(&yaml_path, &yaml).unwrap();

        let migrated = migrate_pipeline_file(&yaml_path).unwrap();
        assert!(migrated);

        let new_yaml = std::fs::read_to_string(&yaml_path).unwrap();
        assert!(!new_yaml.contains("prompt_file"));
        assert!(new_yaml.contains("mynode")); // as name

        let new_id = deterministic_id("mynode");
        let canonical = tmp.path().join(format!("test.prompts/{new_id}.md"));
        assert!(canonical.exists());
        assert_eq!(std::fs::read_to_string(canonical).unwrap(), "hello prompt");

        // idempotent: second run does nothing
        let not_migrated = migrate_pipeline_file(&yaml_path).unwrap();
        assert!(!not_migrated);
    }

    #[test]
    fn migrate_all_skips_non_yaml() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("readme.md"), "# hi").unwrap();
        std::fs::write(
            tmp.path().join("pipe.yaml"),
            "name: p\nversion: '1.0'\nnodes:\n  - id: n1\n    type: doc-only\n    inputs: []\n    outputs: []\nedges: []\n",
        )
        .unwrap();

        let count = migrate_all(tmp.path()).unwrap();
        assert_eq!(count, 1);

        // second run: already migrated
        let count2 = migrate_all(tmp.path()).unwrap();
        assert_eq!(count2, 0);
    }
}
