//! Layer 3 — review comments over a real daemon (#750, ADR-0067 §2–3).
//!
//! Closes the backend ACs end-to-end against a booted daemon: `POST
//! /runs/<id>/review/comments/send` turns a batch of drafts into `sent`
//! comments that
//!   - land as `review_comment_sent` events in the Run's log, one per comment,
//!     with sequential `rc-NNN` ids and a shared batch id,
//!   - are projected into `GET /runs/<id>` (`review_comments`) and listed by
//!     `GET /runs/<id>/review/comments`, with the hunk excerpt and the SHAs,
//!   - are pushed over the WebSocket (the browser refreshes from them),
//!   - **start the manager on demand** (its tmux session exists after the send),
//!   - and are refused with `run_branch_gone` once the Run branch is deleted,
//!     leaving the log untouched.
//!
//! The entry node runs under `exec sleep 600`, so the Run stays live with its
//! branch and worktree in place; the manager session is spawned by the daemon
//! under the same override (a sleeping pane — the paste is best-effort and lands
//! in it harmlessly).

use crate::common::{ws_text, TestDaemon};
use futures_util::StreamExt;

const PIPELINE_NAME: &str = "review-solo";
const PIPELINE_YAML: &str = r#"name: review-solo
version: "1.0"
nodes:
  - id: start
    name: Start
    type: start
    outputs:
      - name: user_prompt
  - id: solo
    name: solo
    type: agent
    isolated_worktree: false
    inputs:
      - name: in
    outputs:
      - name: out
  - id: end
    name: End
    type: end
    inputs:
      - name: result
edges:
  - source: { node: start, port: user_prompt }
    target: { node: solo, port: in }
"#;

fn seed(repo: &std::path::Path) -> anyhow::Result<()> {
    let pipelines_dir = repo.join(".pdo").join("pipelines");
    std::fs::create_dir_all(&pipelines_dir)?;
    std::fs::write(
        pipelines_dir.join(format!("{PIPELINE_NAME}.yaml")),
        PIPELINE_YAML,
    )?;
    let run = |args: &[&str]| -> anyhow::Result<()> {
        let out = std::process::Command::new("git")
            .args(args)
            .current_dir(repo)
            .output()?;
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
    std::fs::write(repo.join("lib.rs"), "fn a() {}\nfn b() {}\nfn c() {}\n")?;
    run(&["add", "."])?;
    run(&["commit", "-q", "-m", "init"])?;
    Ok(())
}

async fn create_run(daemon_url: String, target_repo: String) -> Option<String> {
    let resp = reqwest::Client::new()
        .post(format!("{daemon_url}/runs"))
        .json(&serde_json::json!({
            "pipeline": PIPELINE_NAME,
            "input": "go",
            "target_repo": target_repo,
        }))
        .send()
        .await
        .ok()?;
    let json: serde_json::Value = resp.json().await.ok()?;
    json["run_id"].as_str().map(String::from)
}

fn git(dir: &std::path::Path, args: &[&str]) -> std::process::Output {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    out
}

#[tokio::test]
async fn sent_comments_are_events_projected_pushed_and_start_the_manager() {
    let daemon = TestDaemon::spawn(seed).await.unwrap();
    let repo = daemon.repo_root().to_path_buf();
    let run_id = create_run(daemon.url(), daemon.target_repo())
        .await
        .expect("run created");

    let wt_dir = repo.join(".pdo/runs").join(&run_id).join("worktree");
    for _ in 0..100 {
        if wt_dir.exists() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(
        wt_dir.exists(),
        "pipeline worktree should exist for {run_id}"
    );

    // A real change on the Run branch: lib.rs gains a line 4 the reviewer comments on.
    std::fs::write(
        wt_dir.join("lib.rs"),
        "fn a() {}\nfn b() {}\nfn c() {}\nfn d() {}\n",
    )
    .unwrap();
    git(&wt_dir, &["add", "lib.rs"]);
    git(&wt_dir, &["commit", "-q", "-m", "run work"]);

    let mut ws = daemon.connect_ws().await.unwrap();
    let client = reqwest::Client::new();

    let resp = client
        .post(format!("{}/runs/{run_id}/review/comments/send", daemon.url()))
        .json(&serde_json::json!({
            "comments": [
                { "path": "lib.rs", "side": "new", "line": 4, "text": "Name this `fn delta`." },
                { "path": "lib.rs", "side": "old", "line": 1, "from": "fork", "to": "tip", "text": "Still needed?" }
            ]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        200,
        "{}",
        resp.text().await.unwrap_or_default()
    );
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(
        body["manager_started"], true,
        "the manager was started on demand: {body}"
    );
    let sent = body["sent"].as_array().unwrap();
    assert_eq!(sent.len(), 2);
    assert_eq!(sent[0]["id"], "rc-001");
    assert_eq!(sent[1]["id"], "rc-002");
    assert_eq!(sent[0]["batch_id"], sent[1]["batch_id"]);
    assert_eq!(sent[0]["from_ref"], "fork");
    assert_eq!(sent[0]["to_ref"], "tip");
    assert!(sent[0]["from_sha"].as_str().unwrap().len() == 40, "{body}");
    assert!(sent[0]["to_sha"].as_str().unwrap().len() == 40, "{body}");
    assert_ne!(sent[0]["from_sha"], sent[0]["to_sha"]);
    let excerpt = sent[0]["excerpt"].as_str().unwrap();
    assert!(
        excerpt.contains("> 4 | fn d() {}"),
        "excerpt marks the anchored line: {excerpt}"
    );
    assert!(
        excerpt.contains("  2 | fn b() {}"),
        "two lines of context: {excerpt}"
    );
    // The old side reads the source ref: line 1 of the fork's lib.rs.
    assert!(
        sent[1]["excerpt"]
            .as_str()
            .unwrap()
            .contains("> 1 | fn a() {}"),
        "{body}"
    );

    // The manager session exists — spawned by the send.
    let socket = daemon.tmux_socket();
    let session = format!("pdo-mgr-{run_id}");
    let exists = std::process::Command::new("tmux")
        .args(["-L", &socket, "has-session", "-t", &session])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    assert!(
        exists,
        "manager session {session} should be up after the send"
    );

    // Projected into the Run state, listed on its own endpoint, in the log.
    let run: serde_json::Value = client
        .get(format!("{}/runs/{run_id}", daemon.url()))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(run["review_comments"].as_array().unwrap().len(), 2);
    assert_eq!(run["review_comments"][0]["status"], "sent");
    assert_eq!(run["review_comments"][0]["text"], "Name this `fn delta`.");
    assert_eq!(run["has_manager"], true);

    let list: serde_json::Value = client
        .get(format!("{}/runs/{run_id}/review/comments", daemon.url()))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list["comments"].as_array().unwrap().len(), 2);

    let events: Vec<serde_json::Value> = client
        .get(format!("{}/runs/{run_id}/events", daemon.url()))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let sent_events: Vec<&serde_json::Value> = events
        .iter()
        .filter(|e| e["kind"] == "review_comment_sent")
        .collect();
    assert_eq!(sent_events.len(), 2, "one event per comment");
    assert!(
        events.iter().any(|e| e["kind"] == "manager_started"),
        "the on-demand start reserved its session in the log"
    );

    // Pushed over the WebSocket: the browser sees `review_comment_sent` for this run.
    let mut seen = false;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    while tokio::time::Instant::now() < deadline && !seen {
        let next = tokio::time::timeout(std::time::Duration::from_millis(500), ws.next()).await;
        let Ok(Some(Ok(msg))) = next else { continue };
        if let Some(text) = ws_text(&msg) {
            if text.contains("review_comment_sent") && text.contains(&run_id) {
                seen = true;
            }
        }
    }
    assert!(seen, "the WebSocket carried the review_comment_sent event");

    // A second batch continues the id sequence.
    let resp = client
        .post(format!(
            "{}/runs/{run_id}/review/comments/send",
            daemon.url()
        ))
        .json(&serde_json::json!({
            "comments": [{ "path": "lib.rs", "side": "new", "line": 2, "text": "third" }]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["sent"][0]["id"], "rc-003");
    assert_eq!(
        body["manager_started"], false,
        "already running: reused, not respawned"
    );

    // Branch gone ⇒ refused with the reason, nothing appended.
    git(
        &repo,
        &["worktree", "remove", "--force", wt_dir.to_str().unwrap()],
    );
    git(&repo, &["branch", "-D", &format!("pdo/run-{run_id}")]);
    let resp = client
        .post(format!(
            "{}/runs/{run_id}/review/comments/send",
            daemon.url()
        ))
        .json(&serde_json::json!({
            "comments": [{ "path": "lib.rs", "side": "new", "line": 2, "text": "late" }]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 409);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["error"], "run_branch_gone");
    assert!(body["message"]
        .as_str()
        .unwrap()
        .contains("no longer exists"));
    let list: serde_json::Value = client
        .get(format!("{}/runs/{run_id}/review/comments", daemon.url()))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        list["comments"].as_array().unwrap().len(),
        3,
        "the refused one was not recorded"
    );
}

/// Run the real `pdo review …` binary against `daemon`, wrapped with the env of a
/// node / manager session (`PDO_RUN_ID`, `PDO_NODE_ID`) — the identity the daemon
/// deduces the author from. On a blocking task so the runtime keeps serving.
async fn run_pdo_review(
    daemon_url: &str,
    args: &[&str],
    session: Option<(&str, &str)>,
) -> (Option<i32>, String, String) {
    let bin = env!("CARGO_BIN_EXE_pdo");
    let mut cmd = std::process::Command::new(bin);
    cmd.arg("review").args(args);
    cmd.env("PDO_DAEMON_URL", daemon_url);
    cmd.env_remove("PDO_RUN_ID");
    cmd.env_remove("PDO_NODE_ID");
    if let Some((run_id, node_id)) = session {
        cmd.env("PDO_RUN_ID", run_id);
        cmd.env("PDO_NODE_ID", node_id);
    }
    let output =
        tokio::task::spawn_blocking(move || cmd.output().expect("failed to spawn pdo review"))
            .await
            .expect("blocking task panicked");
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    assert!(
        !stderr.contains("panicked"),
        "pdo review must not panic. stderr=\n{stderr}\nstdout=\n{stdout}"
    );
    (output.status.code(), stdout, stderr)
}

/// #751 — the Feature Path's shell half, against a real daemon and the real CLI:
/// `pdo review list` shows the sent comment with its id and state; `pdo review
/// reply <id> --text … --resolved` from the manager session lands as a reply by
/// `manager` **proposing** a resolution (setting off); the human's Resolve and
/// Reopen endpoints flip the state; with `review_agent_can_resolve` on, the same
/// reply resolves directly. Every step is a Run event pushed over the WebSocket.
#[tokio::test]
async fn cli_review_list_and_reply_drive_the_conversation_end_to_end() {
    let daemon = TestDaemon::spawn(seed).await.unwrap();
    let repo = daemon.repo_root().to_path_buf();
    let run_id = create_run(daemon.url(), daemon.target_repo())
        .await
        .expect("run created");
    let wt_dir = repo.join(".pdo/runs").join(&run_id).join("worktree");
    for _ in 0..100 {
        if wt_dir.exists() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    std::fs::write(
        wt_dir.join("lib.rs"),
        "fn a() {}\nfn b() {}\nfn c() {}\nfn d() {}\n",
    )
    .unwrap();
    git(&wt_dir, &["add", "lib.rs"]);
    git(&wt_dir, &["commit", "-q", "-m", "run work"]);

    let client = reqwest::Client::new();
    let resp = client
        .post(format!(
            "{}/runs/{run_id}/review/comments/send",
            daemon.url()
        ))
        .json(&serde_json::json!({
            "comments": [
                { "path": "lib.rs", "side": "new", "line": 4, "text": "Name this `fn delta`." },
                { "path": "lib.rs", "side": "new", "line": 2, "text": "Second remark." }
            ]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let mut ws = daemon.connect_ws().await.unwrap();

    // 1. `pdo review list` from the manager session: both open, with their ids.
    let manager = Some((run_id.as_str(), "__manager__"));
    let (code, stdout, stderr) = run_pdo_review(&daemon.url(), &["list"], manager).await;
    assert_eq!(code, Some(0), "stderr: {stderr}");
    let listed: serde_json::Value = serde_json::from_str(&stdout).expect("JSON on stdout");
    let ids: Vec<&str> = listed["comments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, vec!["rc-001", "rc-002"]);
    assert_eq!(listed["comments"][0]["status"], "sent");
    assert_eq!(listed["agent_can_resolve"], false);

    // Out of a session and without --run: a readable refusal, exit 1.
    let (code, _, stderr) = run_pdo_review(&daemon.url(), &["list"], None).await;
    assert_eq!(code, Some(1));
    assert!(stderr.contains("--run"), "{stderr}");

    // 2. `--resolved` from the manager: a proposal, author `manager`.
    let (code, stdout, stderr) = run_pdo_review(
        &daemon.url(),
        &[
            "reply",
            "rc-001",
            "--text",
            "Renamed to `fn delta` in the Run branch.",
            "--resolved",
        ],
        manager,
    )
    .await;
    assert_eq!(code, Some(0), "stderr: {stderr}");
    assert!(stdout.contains("resolution proposed"), "{stdout}");
    assert!(stdout.contains("author manager"), "{stdout}");
    let run: serde_json::Value = client
        .get(format!("{}/runs/{run_id}", daemon.url()))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let c1 = &run["review_comments"][0];
    assert_eq!(c1["status"], "sent");
    assert_eq!(c1["proposal_pending"], true);
    assert_eq!(c1["replies"][0]["author"], "manager");
    assert_eq!(c1["replies"][0]["proposes_resolution"], true);

    // The reply travelled over the WebSocket.
    let mut seen = false;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    while tokio::time::Instant::now() < deadline && !seen {
        let next = tokio::time::timeout(std::time::Duration::from_millis(500), ws.next()).await;
        let Ok(Some(Ok(msg))) = next else { continue };
        if let Some(text) = ws_text(&msg) {
            if text.contains("review_comment_replied") && text.contains(&run_id) {
                seen = true;
            }
        }
    }
    assert!(
        seen,
        "the WebSocket carried the review_comment_replied event"
    );

    // 3. Resolve → resolved & out of `list` (open); Reopen → back to sent.
    let resp = client
        .post(format!(
            "{}/runs/{run_id}/review/comments/rc-001/resolve",
            daemon.url()
        ))
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let (_, stdout, _) = run_pdo_review(&daemon.url(), &["list"], manager).await;
    let open: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(open["comments"].as_array().unwrap().len(), 1, "{stdout}");
    assert_eq!(open["comments"][0]["id"], "rc-002");
    let (_, stdout, _) =
        run_pdo_review(&daemon.url(), &["list", "--state", "resolved"], manager).await;
    let resolved: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(resolved["comments"][0]["id"], "rc-001");
    assert_eq!(resolved["comments"][0]["resolved_by"], "user");
    let resp = client
        .post(format!(
            "{}/runs/{run_id}/review/comments/rc-001/reopen",
            daemon.url()
        ))
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["comment"]["status"], "sent");
    assert_eq!(body["comment"]["reopened_by"], "user");

    // 4. Setting on: a node session's `--resolved` resolves directly, by the node.
    let resp = client
        .put(format!("{}/settings", daemon.url()))
        .json(&serde_json::json!({ "review_agent_can_resolve": true }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let (code, stdout, stderr) = run_pdo_review(
        &daemon.url(),
        &[
            "reply",
            "rc-002",
            "--body",
            "Done.",
            "--resolved",
            "--run",
            &run_id,
        ],
        Some((run_id.as_str(), "solo")),
    )
    .await;
    assert_eq!(code, Some(0), "stderr: {stderr}");
    assert!(
        stdout.contains("resolved (the instance lets agents resolve"),
        "{stdout}"
    );
    let (_, stdout, _) = run_pdo_review(&daemon.url(), &["list", "--state", "all"], manager).await;
    let all: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    let c2 = all["comments"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "rc-002")
        .unwrap();
    assert_eq!(c2["status"], "resolved");
    assert_eq!(c2["resolved_by"], "solo");
    assert_eq!(c2["replies"][0]["author"], "solo");
    assert_eq!(all["agent_can_resolve"], true);

    // Unknown id: the daemon's sentence reaches stderr, exit 1.
    let (code, _, stderr) =
        run_pdo_review(&daemon.url(), &["reply", "rc-999", "--text", "x"], manager).await;
    assert_eq!(code, Some(1));
    assert!(stderr.contains("rc-999"), "{stderr}");

    // The whole conversation is in the log, in order.
    let events: Vec<serde_json::Value> = client
        .get(format!("{}/runs/{run_id}/events", daemon.url()))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let kinds: Vec<&str> = events
        .iter()
        .map(|e| e["kind"].as_str().unwrap())
        .filter(|k| k.starts_with("review_comment_re"))
        .collect();
    assert_eq!(
        kinds,
        vec![
            "review_comment_replied",
            "review_comment_resolved",
            "review_comment_reopened",
            "review_comment_replied",
            "review_comment_resolved",
        ]
    );
}
