#[cfg(test)]
mod tests {
    use crate::graph_resolver::{compute_body_subgraph, BodyResolutionError};
    use crate::pipeline::{EdgeDef, EdgeEndpoint, NodeDef, NodeType, Port};
    use pretty_assertions::assert_eq;
    use std::collections::{HashMap, HashSet};

    fn make_node(id: &str, node_type: NodeType, inputs: &[&str], outputs: &[&str]) -> NodeDef {
        NodeDef {
            id: id.into(),
            name: id.into(),
            node_type,
            inputs: inputs
                .iter()
                .map(|n| Port {
                    name: (*n).into(),
                    repeated: false,
                    side: None,
                    frontmatter: None,
                    when: None,
                    description: None,
                })
                .collect(),
            outputs: outputs
                .iter()
                .map(|n| Port {
                    name: (*n).into(),
                    repeated: false,
                    side: None,
                    frontmatter: None,
                    when: None,
                    description: None,
                })
                .collect(),
            interactive: false,
            view: None,
            max_iter: None,
            over: None,
        }
    }

    fn make_loop_node(id: &str, max_iter: i64) -> NodeDef {
        NodeDef {
            id: id.into(),
            name: id.into(),
            node_type: NodeType::Loop,
            inputs: vec![
                Port {
                    name: "in".into(),
                    repeated: false,
                    side: None,
                    frontmatter: None,
                    when: None,
                    description: None,
                },
                Port {
                    name: "break".into(),
                    repeated: false,
                    side: None,
                    frontmatter: None,
                    when: None,
                    description: None,
                },
            ],
            outputs: vec![
                Port {
                    name: "body".into(),
                    repeated: false,
                    side: None,
                    frontmatter: None,
                    when: None,
                    description: None,
                },
                Port {
                    name: "done".into(),
                    repeated: false,
                    side: None,
                    frontmatter: None,
                    when: None,
                    description: None,
                },
            ],
            interactive: false,
            view: None,
            max_iter: Some(serde_yaml::Value::Number(serde_yaml::Number::from(
                max_iter,
            ))),
            over: None,
        }
    }

    fn make_edge(src_node: &str, src_port: &str, tgt_node: &str, tgt_port: &str) -> EdgeDef {
        EdgeDef {
            source: EdgeEndpoint {
                node: src_node.into(),
                port: src_port.into(),
            },
            target: EdgeEndpoint {
                node: tgt_node.into(),
                port: tgt_port.into(),
            },
            reason: None,
        }
    }

    fn make_pipeline(nodes: Vec<NodeDef>, edges: Vec<EdgeDef>) -> crate::pipeline::PipelineDef {
        crate::pipeline::PipelineDef {
            name: "test".into(),
            version: None,
            variables: HashMap::new(),
            nodes,
            edges,
        }
    }

    #[test]
    fn linear_body_returns_all_nodes() {
        let pipeline = make_pipeline(
            vec![
                make_loop_node("loop1", 5),
                make_node("a", NodeType::DocOnly, &["in"], &["out"]),
                make_node("b", NodeType::DocOnly, &["in"], &["out"]),
                make_node("sw", NodeType::Switch, &["in"], &["pass", "default"]),
            ],
            vec![
                make_edge("loop1", "body", "a", "in"),
                make_edge("a", "out", "b", "in"),
                make_edge("b", "out", "sw", "in"),
                make_edge("sw", "pass", "loop1", "break"),
            ],
        );

        let body = compute_body_subgraph(&pipeline, "loop1").unwrap();
        let expected: HashSet<String> = ["a", "b", "sw"].iter().map(|s| s.to_string()).collect();
        assert_eq!(body, expected);
    }

    #[test]
    fn body_with_internal_switch_all_branches_stay() {
        let pipeline = make_pipeline(
            vec![
                make_loop_node("loop1", 5),
                make_node("impl", NodeType::CodeMutating, &["in"], &["out"]),
                make_node("reviewer", NodeType::DocOnly, &["in"], &["review"]),
                make_node("sw", NodeType::Switch, &["in"], &["pass", "default"]),
            ],
            vec![
                make_edge("loop1", "body", "impl", "in"),
                make_edge("impl", "out", "reviewer", "in"),
                make_edge("reviewer", "review", "sw", "in"),
                make_edge("sw", "pass", "loop1", "break"),
                make_edge("sw", "default", "impl", "in"),
            ],
        );

        let body = compute_body_subgraph(&pipeline, "loop1").unwrap();
        let expected: HashSet<String> = ["impl", "reviewer", "sw"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(body, expected);
    }

    #[test]
    fn nested_loops_outer_excludes_inner_body() {
        let pipeline = make_pipeline(
            vec![
                make_loop_node("outer", 3),
                make_loop_node("inner", 5),
                make_node("inner_worker", NodeType::DocOnly, &["in"], &["out"]),
            ],
            vec![
                make_edge("outer", "body", "inner", "in"),
                make_edge("inner", "body", "inner_worker", "in"),
                make_edge("inner_worker", "out", "inner", "break"),
                make_edge("inner", "done", "outer", "break"),
            ],
        );

        let body = compute_body_subgraph(&pipeline, "outer").unwrap();
        let expected: HashSet<String> = ["inner"].iter().map(|s| s.to_string()).collect();
        assert_eq!(body, expected);
    }

    #[test]
    fn empty_body_returns_error() {
        let pipeline = make_pipeline(vec![make_loop_node("loop1", 5)], vec![]);

        let result = compute_body_subgraph(&pipeline, "loop1");
        assert_eq!(result, Err(BodyResolutionError::EmptyBody("loop1".into())));
    }

    #[test]
    fn no_exit_returns_error() {
        let pipeline = make_pipeline(
            vec![
                make_loop_node("loop1", 5),
                make_node("a", NodeType::DocOnly, &["in"], &["out"]),
                make_node("b", NodeType::DocOnly, &["in"], &["out"]),
            ],
            vec![
                make_edge("loop1", "body", "a", "in"),
                make_edge("a", "out", "b", "in"),
            ],
        );

        let result = compute_body_subgraph(&pipeline, "loop1");
        assert_eq!(
            result,
            Err(BodyResolutionError::NoExitToBreakOrDone("loop1".into()))
        );
    }

    #[test]
    fn loop_not_found_returns_error() {
        let pipeline = make_pipeline(vec![], vec![]);
        let result = compute_body_subgraph(&pipeline, "nonexistent");
        assert_eq!(
            result,
            Err(BodyResolutionError::LoopNotFound("nonexistent".into()))
        );
    }

    #[test]
    fn non_loop_node_returns_error() {
        let pipeline = make_pipeline(
            vec![make_node("a", NodeType::DocOnly, &["in"], &["out"])],
            vec![],
        );
        let result = compute_body_subgraph(&pipeline, "a");
        assert_eq!(result, Err(BodyResolutionError::LoopNotFound("a".into())));
    }
}
