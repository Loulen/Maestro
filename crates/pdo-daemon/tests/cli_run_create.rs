//! Layer 3a — the `pdo run create` CLI contract (issue #721, ADR-0064): a thin
//! client of the daemon's `POST /runs`, tested like `cli_complete_does_not_panic.rs`
//! by spawning the real `pdo` binary in a subprocess.
//!
//! - From a node session (`PDO_RUN_ID` / `PDO_NODE_ID` env, the exact vars the
//!   session is wrapped with): the created Run is mechanically linked to that
//!   Run + node, and its project defaults to the parent's.
//! - From a plain terminal (no env): a root Run — no error about a missing
//!   session context.
//! - Flags pass through to `POST /runs`: the daemon's frozen Run state carries
//!   what the CLI named.
//! - Daemon refusals (unknown pipeline) surface the daemon's own `error`
//!   sentence on stderr with a non-zero exit.

use std::process::Command;

use crate::common::TestDaemon;

const PIPELINE_NAME: &str = "cli-run-create-parent";
const PIPELINE_YAML: &str = r#"name: cli-run-create-parent
version: "1.0"
nodes:
  - id: start
    name: Start
    type: start
    outputs:
      - name: user_prompt
  - id: worker
    name: worker
    type: agent
    isolated_worktree: false
    inputs:
      - name: task
    outputs:
      - name: result
    view: { x: 200, y: 100 }
  - id: end
    name: End
    type: end
    inputs:
      - name: result
edges:
  - source: { node: start, port: user_prompt }
    target: { node: worker, port: task }
"#;

const CHILD_PIPELINE_NAME: &str = "cli-run-create-child";
const CHILD_PIPELINE_YAML: &str = r#"name: cli-run-create-child
version: "1.0"
nodes:
  - id: start
    name: Start
    type: start
    outputs:
      - name: user_prompt
  - id: end
    name: End
    type: end
    inputs:
      - name: result
edges:
  - source: { node: start, port: user_prompt }
    target: { node: end, port: result }
"#;

fn git_init_with_commit(repo: &std::path::Path) -> anyhow::Result<()> {
    let run = |args: &[&str]| -> anyhow::Result<()> {
        let out = Command::new("git").args(args).current_dir(repo).output()?;
        if !out.status.success() {
            anyhow::bail!(
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&out.stderr)
            );
        }
        Ok(())
    };
    run(&["init", "-q", "-b", "main"])?;
    run(&["config", "user.email", "test@example.com"])?;
    run(&["config", "user.name", "Test"])?;
    run(&["config", "commit.gpgsign", "false"])?;
    std::fs::write(repo.join(".gitignore"), ".pdo/runs/\n")?;
    run(&["add", "."])?;
    run(&["commit", "-q", "-m", "init"])?;
    Ok(())
}

fn seed(repo: &std::path::Path) -> anyhow::Result<()> {
    let pipelines_dir = repo.join(".pdo").join("pipelines");
    std::fs::create_dir_all(&pipelines_dir)?;
    std::fs::write(
        pipelines_dir.join(format!("{PIPELINE_NAME}.yaml")),
        PIPELINE_YAML,
    )?;
    let prompts_dir = pipelines_dir.join(format!("{PIPELINE_NAME}.prompts"));
    std::fs::create_dir_all(&prompts_dir)?;
    std::fs::write(prompts_dir.join("worker.md"), "You are a worker.\n")?;
    std::fs::write(
        pipelines_dir.join(format!("{CHILD_PIPELINE_NAME}.yaml")),
        CHILD_PIPELINE_YAML,
    )?;
    git_init_with_commit(repo)?;
    Ok(())
}

/// Run the real binary against `daemon`. `session` carries the env vars a node
/// session is wrapped with; `None` is a plain user terminal. On a **blocking**
/// task so the host runtime stays free to serve the daemon's HTTP requests.
async fn run_pdo_run_create(
    daemon_url: &str,
    args: &[&str],
    session: Option<(&str, &str)>,
) -> (Option<i32>, String, String) {
    let bin = env!("CARGO_BIN_EXE_pdo");
    let mut cmd = Command::new(bin);
    cmd.args(["run", "create"]).args(args);
    cmd.env("PDO_DAEMON_URL", daemon_url);
    // Out of session the vars must be ABSENT, not empty — a real terminal has
    // no PDO_* env at all.
    cmd.env_remove("PDO_RUN_ID");
    cmd.env_remove("PDO_NODE_ID");
    if let Some((run_id, node_id)) = session {
        cmd.env("PDO_RUN_ID", run_id);
        cmd.env("PDO_NODE_ID", node_id);
    }
    let output =
        tokio::task::spawn_blocking(move || cmd.output().expect("failed to spawn pdo run create"))
            .await
            .expect("blocking task panicked");
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    assert!(
        !stderr.contains("panicked"),
        "pdo run create must not panic. stderr=\n{stderr}\nstdout=\n{stdout}"
    );
    (output.status.code(), stdout, stderr)
}

async fn get_json(daemon: &TestDaemon, path: &str) -> (u16, serde_json::Value) {
    let resp = reqwest::get(format!("{}{}", daemon.url(), path))
        .await
        .unwrap();
    let status = resp.status().as_u16();
    let json: serde_json::Value = resp.json().await.unwrap();
    (status, json)
}

async fn create_root_run(daemon: &TestDaemon) -> String {
    let body = serde_json::json!({
        "pipeline": PIPELINE_NAME,
        "input": "hello world",
        "target_repo": daemon.target_repo(),
    });
    let resp = reqwest::Client::new()
        .post(format!("{}/runs", daemon.url()))
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201, "POST /runs should return 201");
    let json: serde_json::Value = resp.json().await.unwrap();
    json["run_id"].as_str().unwrap().to_string()
}

/// Wait until the parent's `worker` node holds a live session (the TestDaemon's
/// tmux override `exec sleep 600` keeps it alive indefinitely).
async fn wait_node_running(daemon: &TestDaemon, run_id: &str, node_id: &str) {
    for _ in 0..100 {
        let (status, run) = get_json(daemon, &format!("/runs/{run_id}")).await;
        assert_eq!(status, 200);
        if run["nodes"][node_id]["status"] == "running" {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("node {node_id} of run {run_id} never reached `running`");
}

/// Extract the created run's id from the CLI's stdout — `Run <id> created …`.
fn run_id_from_stdout(stdout: &str) -> String {
    let rest = stdout
        .trim()
        .strip_prefix("Run ")
        .unwrap_or_else(|| panic!("stdout should announce the run identity: {stdout}"));
    rest.split_whitespace()
        .next()
        .unwrap_or_else(|| panic!("stdout should carry the run id: {stdout}"))
        .to_string()
}

#[tokio::test]
async fn from_a_node_session_the_created_run_is_a_linked_child() {
    let daemon = TestDaemon::spawn(seed).await.unwrap();
    let parent = create_root_run(&daemon).await;
    wait_node_running(&daemon, &parent, "worker").await;

    // NO --target-repo: the child's project defaults to the parent's (spec
    // #719 story 13) — the one-flag common case the CLI exists for.
    let (code, stdout, stderr) = run_pdo_run_create(
        &daemon.url(),
        &[CHILD_PIPELINE_NAME, "--input", "child work"],
        Some((&parent, "worker")),
    )
    .await;
    assert_eq!(code, Some(0), "stderr=\n{stderr}\nstdout=\n{stdout}");
    let child_id = run_id_from_stdout(&stdout);
    assert!(
        stdout.contains(&parent) && stdout.contains("worker"),
        "the CLI displays the child's identity WITH its parent link: {stdout}"
    );

    // The HTTP surface of the daemon is the witness of the mechanical link.
    let (status, run) = get_json(&daemon, &format!("/runs/{child_id}")).await;
    assert_eq!(status, 200);
    assert_eq!(run["parent_run_id"], parent, "linked to the session's run");
    assert_eq!(
        run["parent_node_id"], "worker",
        "linked to the session's node"
    );
    assert_eq!(
        run["target_repo"],
        daemon.target_repo(),
        "child project defaults to the parent's"
    );
}

#[tokio::test]
async fn from_a_plain_terminal_the_created_run_is_a_root() {
    let daemon = TestDaemon::spawn(seed).await.unwrap();

    // No session env at all, and ADR-0033 keeps the boundary: an explicit
    // --target-repo is required out of session.
    let (code, stdout, stderr) = run_pdo_run_create(
        &daemon.url(),
        &[
            CHILD_PIPELINE_NAME,
            "--input",
            "standalone work",
            "--target-repo",
            &daemon.target_repo(),
        ],
        None,
    )
    .await;
    assert_eq!(code, Some(0), "stderr=\n{stderr}\nstdout=\n{stdout}");
    let run_id = run_id_from_stdout(&stdout);
    assert!(
        stdout.contains("root"),
        "out of session the CLI says the run is a root: {stdout}"
    );

    let (status, run) = get_json(&daemon, &format!("/runs/{run_id}")).await;
    assert_eq!(status, 200);
    assert!(
        run.get("parent_run_id").is_none(),
        "an out-of-session create is a root run: {run}"
    );
    assert!(run.get("parent_node_id").is_none());
}

#[tokio::test]
async fn creation_flags_pass_through_to_the_daemon() {
    let daemon = TestDaemon::spawn(seed).await.unwrap();
    let parent = create_root_run(&daemon).await;
    wait_node_running(&daemon, &parent, "worker").await;

    // Overriding skills and the agentic profile (FP #3): the child run runs
    // with those settings — frozen into its RunStarted, projected on GET.
    let (code, stdout, stderr) = run_pdo_run_create(
        &daemon.url(),
        &[
            CHILD_PIPELINE_NAME,
            "--input",
            "flagged child",
            "--name",
            "flagged child",
            "--skills",
            "alpha,beta",
            "--harness",
            "pi",
            "--source-branch",
            "main",
            "--auto-fail",
            "true",
        ],
        Some((&parent, "worker")),
    )
    .await;
    assert_eq!(code, Some(0), "stderr=\n{stderr}\nstdout=\n{stdout}");
    let child_id = run_id_from_stdout(&stdout);

    let (status, run) = get_json(&daemon, &format!("/runs/{child_id}")).await;
    assert_eq!(status, 200);
    let skills: Vec<&str> = run["skills"]
        .as_array()
        .expect("skills projected on the run state")
        .iter()
        .filter_map(|s| s["id"].as_str())
        .collect();
    assert_eq!(
        skills,
        vec!["alpha", "beta"],
        "Run-tier skills pass through"
    );
    assert_eq!(run["harness"], "pi", "the harness flag passes through");
    assert_eq!(run["name"], "flagged child");
    assert_eq!(run["auto_fail"], true);
    assert_eq!(run["parent_run_id"], parent, "still mechanically linked");
}

#[tokio::test]
async fn daemon_refusals_surface_readably() {
    let daemon = TestDaemon::spawn(seed).await.unwrap();

    // Unknown pipeline: the daemon's own sentence, not a bare status.
    let (code, stdout, stderr) = run_pdo_run_create(
        &daemon.url(),
        &["no-such-pipeline", "--target-repo", &daemon.target_repo()],
        None,
    )
    .await;
    assert_ne!(code, Some(0), "a refused create must exit non-zero");
    assert!(
        stderr.contains("daemon refused run creation"),
        "the refusal names the daemon as its source: {stderr}"
    );
    assert!(
        stderr.contains("cannot read pipeline"),
        "the refusal carries the daemon's error sentence: {stderr}"
    );
    assert!(
        stdout.trim().is_empty(),
        "a refused create prints nothing to stdout: {stdout}"
    );

    // Unreachable daemon: a breakdown, also non-zero.
    let (code, _stdout, stderr) = run_pdo_run_create(
        "http://127.0.0.1:1",
        &[CHILD_PIPELINE_NAME, "--target-repo", "/tmp/x"],
        None,
    )
    .await;
    assert_ne!(code, Some(0));
    assert!(stderr.contains("failed to reach daemon"), "{stderr}");
}
