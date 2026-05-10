//! Regression test for the "Tester self-SIGKILL after 10–50 s" bug
//! (`docs/testing/INVESTIGATION.md`).
//!
//! When the daemon spawns tmux via `Command::new("tmux").output()`, the tmux
//! client inherits piped stdin/stdout/stderr (no controlling tty). The pane
//! process that tmux server forks then ends up in a terminal environment
//! that makes `claude` observe `/dev/tty` ENXIO mid-run and self-SIGKILL.
//! The fix wraps the client invocation in a fresh pty (see
//! `tmux_session_manager::run_tmux_via_pty`).
//!
//! This test makes the calling process's stdin a non-tty (`/dev/null`) and
//! then calls `spawn()` directly. Before the fix, this would still produce
//! a working session (tmux client itself doesn't crash), but the regression
//! marker is: the new code path must continue to succeed even when the
//! caller has no tty. Single-test file by design — the FD-0 swap mutates
//! process-global state and we don't want a sibling test racing it.

use std::os::fd::AsRawFd;
use std::time::Duration;

use maestro_daemon::{tmux_session_manager, TMUX_CMD_OVERRIDE_ENV};

fn tmux_available() -> bool {
    std::process::Command::new("tmux")
        .arg("-V")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn tmux_has_session(session: &str) -> bool {
    std::process::Command::new("tmux")
        .args(["has-session", "-t", session])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[test]
fn spawn_succeeds_when_caller_has_no_controlling_tty() {
    if !tmux_available() {
        eprintln!("tmux not on PATH — skipping");
        return;
    }

    // Substitute claude → sleep 30 so the test box doesn't actually need claude.
    std::env::set_var(TMUX_CMD_OVERRIDE_ENV, "exec sleep 30");

    let tmpdir = tempfile::tempdir().expect("tempdir");
    let session = format!("maestro-regress-no-tty-{}", std::process::id());

    // Snapshot stdin so we can restore it before assertions can panic.
    let saved_stdin = unsafe { libc::dup(0) };
    assert!(saved_stdin >= 0, "failed to dup stdin");

    // Replace stdin with /dev/null, mimicking the daemon's no-tty environment.
    let devnull = std::fs::File::open("/dev/null").expect("open /dev/null");
    let rc = unsafe { libc::dup2(devnull.as_raw_fd(), 0) };
    assert!(rc >= 0, "dup2 stdin failed");
    drop(devnull);

    // Sanity-check that stdin is no longer a tty in this process.
    let isatty = unsafe { libc::isatty(0) };
    let result = tmux_session_manager::spawn(
        &session,
        "test prompt",
        tmpdir.path(),
        "regress-run",
        "regress-node",
        1,
        5172,
    );

    // Restore stdin before any panic from the assertions below.
    let restore = unsafe { libc::dup2(saved_stdin, 0) };
    unsafe { libc::close(saved_stdin) };

    // Always best-effort kill regardless of outcome.
    let cleanup = || {
        let _ = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &session])
            .output();
        std::env::remove_var(TMUX_CMD_OVERRIDE_ENV);
    };

    assert_eq!(restore, 0, "failed to restore stdin");
    assert_eq!(
        isatty, 0,
        "test setup invariant: stdin should not be a tty here"
    );

    if let Err(e) = &result {
        cleanup();
        panic!("spawn failed in no-tty context: {e:#}");
    }

    // Session should exist and stay alive for at least 1 second (sleep 30
    // override gives us plenty of headroom). Poll briefly to dodge a race
    // with tmux's session-creation latency.
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    let mut alive = false;
    while std::time::Instant::now() < deadline {
        if tmux_has_session(&session) {
            alive = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    if !alive {
        cleanup();
        panic!("expected session `{session}` to exist within 2s of spawn");
    }

    // Sleep briefly and recheck — proves the session isn't torn down
    // immediately after creation (a real regression for a Tester run).
    std::thread::sleep(Duration::from_millis(500));
    let still_alive = tmux_has_session(&session);

    cleanup();

    assert!(
        still_alive,
        "session `{session}` died within 500ms of creation — regression"
    );
}
