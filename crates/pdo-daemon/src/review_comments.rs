//! Review comments (#750, ADR-0067 §2; CONTEXT.md § "Commentaire de review",
//! "Envoi au manager").
//!
//! A review comment is a remark anchored on one line of one file of the diff
//! between two Run refs: `(path, side, line, from, to)`. Its `draft` state lives
//! in the browser only. From `sent` on, everything is a **Run event**: the
//! comment itself (`review_comment_sent`), and — for the next ticket (#751) — the
//! agent's replies, the resolutions and the reopenings. This module owns the
//! projected shape of those events, the id scheme, the hunk excerpt and the
//! **single batch message** the Pipeline Manager receives per send.
//!
//! Sent comments are immutable: no event edits or deletes one, and nothing here
//! offers to. The fold is additive on a terminal Run — review happens on a
//! completed Run, post-mortem, so the projection must never treat these events
//! as a re-opening.

use serde::{Deserialize, Serialize};

use crate::event_log::{Event, EventKind};

/// The side of the diff a comment is anchored on. `old` = the source ref's
/// content (a deleted or context line numbered on the left), `new` = the
/// destination ref's (an added or context line numbered on the right).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReviewSide {
    Old,
    New,
}

impl ReviewSide {
    /// GitHub's letter for the anchor label: `L` for the left (old) side, `R`
    /// for the right (new) side — `ReviewPage.tsx:R48`.
    pub(crate) fn letter(self) -> char {
        match self {
            ReviewSide::Old => 'L',
            ReviewSide::New => 'R',
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            ReviewSide::Old => "old",
            ReviewSide::New => "new",
        }
    }

    pub(crate) fn parse(s: &str) -> Option<ReviewSide> {
        match s {
            "old" => Some(ReviewSide::Old),
            "new" => Some(ReviewSide::New),
            _ => None,
        }
    }
}

/// Lifecycle after `sent`. `Resolved` and the reopen path are folded here so
/// #751 only adds emitters; nothing in #750 produces them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReviewCommentStatus {
    Sent,
    Resolved,
}

/// One reply of an agent (manager or node of the Run, author recorded) to a
/// sent comment — `review_comment_replied`. Folded for #751's `pdo review reply`;
/// the shape is fixed here so the message the manager receives can already name
/// the contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ReviewReply {
    pub author: String,
    pub text: String,
    pub at: String,
    /// The agent proposes a resolution with this reply (#751 decides whether it
    /// resolves directly, under `review_agent_can_resolve`).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub proposes_resolution: bool,
}

/// A sent comment as projected into `RunState::review_comments`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ReviewComment {
    /// `rc-001`, `rc-002`, … — sequential per Run, the id the manager echoes in
    /// `pdo review reply`.
    pub id: String,
    pub path: String,
    pub side: ReviewSide,
    pub line: i64,
    /// Stable Run ref ids of the pair the comment was written against
    /// (`fork`, `tip`, `node:<id>:<iter>:after`, …).
    pub from_ref: String,
    pub to_ref: String,
    /// The SHAs those ids resolved to at send time — what makes the anchor
    /// meaningful once the Run tip moved (#752's outdated logic reads these).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_sha: Option<String>,
    pub text: String,
    /// The hunk excerpt around the anchored line at send time, `>` marking it.
    /// Kept so the comment reads post-mortem even when the file is gone.
    #[serde(default)]
    pub excerpt: String,
    pub author: String,
    pub sent_at: String,
    /// The send batch this comment travelled in — one message to the manager
    /// per batch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(default = "default_status")]
    pub status: ReviewCommentStatus,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub replies: Vec<ReviewReply>,
}

fn default_status() -> ReviewCommentStatus {
    ReviewCommentStatus::Sent
}

/// `rc-NNN` for the `n`-th comment of the Run (1-based). Three digits keep the
/// ids aligned in the manager's message; past 999 the number simply widens.
pub(crate) fn comment_id(n: usize) -> String {
    format!("rc-{n:03}")
}

/// The excerpt of `content` around `line` (1-based): `context` lines on each
/// side, numbered, the anchored line marked with `>`. Empty when the line is
/// outside the file (the anchor no longer resolves — the comment still sends).
pub(crate) fn excerpt(content: &str, line: i64, context: usize) -> String {
    if line < 1 {
        return String::new();
    }
    let lines: Vec<&str> = content.lines().collect();
    let idx = (line - 1) as usize;
    if idx >= lines.len() {
        return String::new();
    }
    let start = idx.saturating_sub(context);
    let end = (idx + context + 1).min(lines.len());
    let width = end.to_string().len();
    let mut out = String::new();
    for (i, l) in lines.iter().enumerate().take(end).skip(start) {
        let marker = if i == idx { '>' } else { ' ' };
        out.push_str(&format!("{marker} {:>width$} | {l}\n", i + 1));
    }
    out.trim_end_matches('\n').to_string()
}

/// The **one message** a batch of freshly sent comments produces for the
/// Pipeline Manager (CONTEXT.md « Envoi au manager »): per comment its id, the
/// anchor, the ref pair, the hunk excerpt, the text, and the instruction to
/// answer through `pdo review reply`. Never one message per comment — the
/// manager would answer N times.
pub(crate) fn batch_message(
    run_id: &str,
    from_label: &str,
    to_label: &str,
    comments: &[ReviewComment],
) -> String {
    let n = comments.len();
    let mut out = format!(
        "Review comments — {n} new on Run {run_id} ({from_label} → {to_label}).\n\
         A human reviewed the diff between these two Run refs and left the remarks below. \
         Each one is an immutable Run event with its own id.\n\n"
    );
    for c in comments {
        let short =
            |s: &Option<String>| s.as_deref().map(|x| x.chars().take(7).collect::<String>());
        let shas = match (short(&c.from_sha), short(&c.to_sha)) {
            (Some(f), Some(t)) => format!(" ({f} → {t})"),
            _ => String::new(),
        };
        out.push_str(&format!(
            "[{id}] {path}:{letter}{line} · {side} side · {from} → {to}{shas}\n",
            id = c.id,
            path = c.path,
            letter = c.side.letter(),
            line = c.line,
            side = c.side.as_str(),
            from = c.from_ref,
            to = c.to_ref,
        ));
        if !c.excerpt.is_empty() {
            for l in c.excerpt.lines() {
                out.push_str("    ");
                out.push_str(l);
                out.push('\n');
            }
        }
        out.push_str("  Comment:\n");
        for l in c.text.lines() {
            out.push_str("  ");
            out.push_str(l);
            out.push('\n');
        }
        out.push('\n');
    }
    out.push_str(
        "Reply to each comment with `pdo review reply <id> --text \"<your answer>\"` \
         (add `--resolved` once you consider it addressed; `pdo review list` lists the open ones). \
         Address the code the comment points at — fix it on the Run branch, or explain why not. \
         Comments themselves are immutable: never try to edit or delete one.",
    );
    out
}

/// Fold one review event into the projected list. Additive only; unknown ids
/// on a reply/resolve/reopen are ignored with a warning (a hand-crafted or
/// replayed event must never panic the projection).
pub(crate) fn fold(comments: &mut Vec<ReviewComment>, event: &Event) {
    let Some(payload) = event.payload.as_ref() else {
        return;
    };
    match event.kind {
        EventKind::ReviewCommentSent => {
            match serde_json::from_value::<ReviewComment>(payload.clone()) {
                Ok(mut c) => {
                    if c.sent_at.is_empty() {
                        c.sent_at = event.ts.clone();
                    }
                    if comments.iter().any(|x| x.id == c.id) {
                        tracing::warn!(
                            "review_comment_sent replays id {} on run {}; keeping the first",
                            c.id,
                            event.run_id
                        );
                        return;
                    }
                    comments.push(c);
                }
                Err(e) => tracing::warn!(
                    "review_comment_sent carries an unreadable payload ({payload}): {e}; skipped"
                ),
            }
        }
        EventKind::ReviewCommentReplied => {
            let Some(id) = payload.get("id").and_then(|v| v.as_str()) else {
                return;
            };
            let Some(c) = comments.iter_mut().find(|c| c.id == id) else {
                tracing::warn!("review_comment_replied names unknown comment {id}; skipped");
                return;
            };
            c.replies.push(ReviewReply {
                author: payload
                    .get("author")
                    .and_then(|v| v.as_str())
                    .unwrap_or("agent")
                    .to_string(),
                text: payload
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                at: event.ts.clone(),
                proposes_resolution: payload
                    .get("proposes_resolution")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            });
        }
        EventKind::ReviewCommentResolved | EventKind::ReviewCommentReopened => {
            let Some(id) = payload.get("id").and_then(|v| v.as_str()) else {
                return;
            };
            let Some(c) = comments.iter_mut().find(|c| c.id == id) else {
                tracing::warn!("{:?} names unknown comment {id}; skipped", event.kind);
                return;
            };
            c.status = if event.kind == EventKind::ReviewCommentResolved {
                ReviewCommentStatus::Resolved
            } else {
                ReviewCommentStatus::Sent
            };
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sent(id: &str, line: i64) -> ReviewComment {
        ReviewComment {
            id: id.into(),
            path: "frontend/src/pages/ReviewPage.tsx".into(),
            side: ReviewSide::New,
            line,
            from_ref: "fork".into(),
            to_ref: "tip".into(),
            from_sha: Some("a1b2c3d4e5f6a7b8".into()),
            to_sha: Some("d4e5f6a7b8c9d0e1".into()),
            text: "`canSend` should be false\nwhile sending.".into(),
            excerpt: excerpt("l1\nl2\nl3\nl4\nl5\nl6", line, 2),
            author: "user".into(),
            sent_at: "2026-09-09T10:00:00.000Z".into(),
            batch_id: Some("b1".into()),
            status: ReviewCommentStatus::Sent,
            replies: vec![],
        }
    }

    fn ev(kind: EventKind, payload: serde_json::Value) -> Event {
        Event {
            id: None,
            run_id: "r1".into(),
            ts: "2026-09-09T10:00:00.000Z".into(),
            kind,
            node_id: None,
            iter: None,
            payload: Some(payload),
        }
    }

    #[test]
    fn ids_are_sequential_and_padded() {
        assert_eq!(comment_id(1), "rc-001");
        assert_eq!(comment_id(42), "rc-042");
        assert_eq!(comment_id(1000), "rc-1000");
    }

    #[test]
    fn excerpt_marks_the_line_and_clamps_at_the_edges() {
        let e = excerpt("a\nb\nc\nd\ne", 2, 2);
        assert_eq!(e, "  1 | a\n> 2 | b\n  3 | c\n  4 | d");
        let tail = excerpt("a\nb\nc", 3, 1);
        assert_eq!(tail, "  2 | b\n> 3 | c");
        assert_eq!(excerpt("a\nb", 5, 2), "");
        assert_eq!(excerpt("a\nb", 0, 2), "");
    }

    #[test]
    fn batch_message_is_one_message_with_ids_anchors_refs_excerpts_and_reply_instruction() {
        let msg = batch_message(
            "run-1",
            "Fork point",
            "Run tip",
            &[sent("rc-001", 3), sent("rc-002", 5)],
        );
        assert!(msg.starts_with("Review comments — 2 new on Run run-1 (Fork point → Run tip)."));
        assert!(msg.contains("[rc-001] frontend/src/pages/ReviewPage.tsx:R3 · new side · fork → tip (a1b2c3d → d4e5f6a)"));
        assert!(msg.contains("[rc-002] frontend/src/pages/ReviewPage.tsx:R5"));
        assert!(msg.contains("    > 3 | l3"), "excerpt with marker: {msg}");
        assert!(msg.contains("  `canSend` should be false\n  while sending."));
        assert!(msg.contains("pdo review reply <id> --text"));
        assert!(msg.contains("pdo review list"));
        assert!(msg.contains("immutable"));
    }

    #[test]
    fn fold_appends_sent_comments_and_ignores_replays() {
        let mut list = vec![];
        let c = sent("rc-001", 3);
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentSent,
                serde_json::to_value(&c).unwrap(),
            ),
        );
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentSent,
                serde_json::to_value(&c).unwrap(),
            ),
        );
        assert_eq!(list.len(), 1);
        assert_eq!(list[0], c);
    }

    #[test]
    fn fold_fills_sent_at_from_the_event_when_absent_and_skips_garbage() {
        let mut list = vec![];
        let mut v = serde_json::to_value(sent("rc-001", 3)).unwrap();
        v["sent_at"] = serde_json::json!("");
        fold(&mut list, &ev(EventKind::ReviewCommentSent, v));
        assert_eq!(list[0].sent_at, "2026-09-09T10:00:00.000Z");
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentSent,
                serde_json::json!({ "nope": 1 }),
            ),
        );
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn fold_replies_resolves_and_reopens_by_id() {
        let mut list = vec![];
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentSent,
                serde_json::to_value(sent("rc-001", 3)).unwrap(),
            ),
        );
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentReplied,
                serde_json::json!({ "id": "rc-001", "author": "manager", "text": "done", "proposes_resolution": true }),
            ),
        );
        assert_eq!(list[0].replies.len(), 1);
        assert_eq!(list[0].replies[0].author, "manager");
        assert!(list[0].replies[0].proposes_resolution);
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentResolved,
                serde_json::json!({ "id": "rc-001" }),
            ),
        );
        assert_eq!(list[0].status, ReviewCommentStatus::Resolved);
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentReopened,
                serde_json::json!({ "id": "rc-001" }),
            ),
        );
        assert_eq!(list[0].status, ReviewCommentStatus::Sent);
        // Unknown id: ignored, never a panic.
        fold(
            &mut list,
            &ev(
                EventKind::ReviewCommentReplied,
                serde_json::json!({ "id": "rc-999", "text": "x" }),
            ),
        );
        assert_eq!(list[0].replies.len(), 1);
    }

    #[test]
    fn serde_round_trip_keeps_the_wire_names() {
        let v = serde_json::to_value(sent("rc-001", 3)).unwrap();
        assert_eq!(v["side"], "new");
        assert_eq!(v["status"], "sent");
        assert!(v.get("replies").is_none(), "empty replies are skipped");
        let back: ReviewComment = serde_json::from_value(v).unwrap();
        assert_eq!(back.side, ReviewSide::New);
    }
}
