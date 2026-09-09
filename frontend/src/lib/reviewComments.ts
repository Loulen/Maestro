import type { ReviewComment, ReviewSide, RunRefs, RunState, SendReviewCommentInput } from "../types";
import type { RefPair } from "./runRefs";

// Review comments of the Review page (#750, ADR-0067 §2; CONTEXT.md
// § "Commentaire de review", "Envoi au manager"). Pure: no React, no fetch.
//
// Two populations share one anchor vocabulary `(path, side, line, from, to)`:
// - **drafts**, browser-only (localStorage per Run; the half-typed text of an
//   open editor in sessionStorage so a stray reload loses nothing);
// - **sent** comments, read from the projected Run state (`review_comments`),
//   immutable, pushed over the WebSocket.
// The page merges both into one list per file and per line.

/** A draft: editable, deletable, only in this browser until sent. */
export interface ReviewDraft {
  /** Local identity (uuid-ish); never sent to the daemon. */
  key: string;
  path: string;
  side: ReviewSide;
  line: number;
  from: string;
  to: string;
  text: string;
  created_at: string;
  updated_at: string;
}

/** The anchor of a comment, draft or sent — what "one comment per line" keys on. */
export interface Anchor {
  path: string;
  side: ReviewSide;
  line: number;
}

/** One entry of the merged list the page renders. */
export type ReviewEntry =
  | { kind: "draft"; anchor: Anchor; draft: ReviewDraft }
  | { kind: "sent"; anchor: Anchor; comment: ReviewComment };

export const DRAFTS_KEY_PREFIX = "pdo.review.drafts.";
export const WIP_KEY_PREFIX = "pdo.review.wip.";

export function draftsKey(runId: string): string {
  return `${DRAFTS_KEY_PREFIX}${runId}`;
}

/** The sessionStorage key of an editor's half-typed text. */
export function wipKey(runId: string, anchor: Anchor, pair: RefPair): string {
  return `${WIP_KEY_PREFIX}${runId}|${anchor.path}|${anchor.side}|${anchor.line}|${pair.from}|${pair.to}`;
}

export function readDrafts(runId: string, storage: Pick<Storage, "getItem"> = localStorage): ReviewDraft[] {
  try {
    const raw = storage.getItem(draftsKey(runId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft);
  } catch {
    return [];
  }
}

export function writeDrafts(
  runId: string,
  drafts: ReviewDraft[],
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage,
): void {
  try {
    if (drafts.length === 0) storage.removeItem(draftsKey(runId));
    else storage.setItem(draftsKey(runId), JSON.stringify(drafts));
  } catch {
    // Private mode / quota: the drafts still live for the session in memory.
  }
}

function isDraft(v: unknown): v is ReviewDraft {
  const d = v as Partial<ReviewDraft> | null;
  return (
    !!d &&
    typeof d.key === "string" &&
    typeof d.path === "string" &&
    (d.side === "old" || d.side === "new") &&
    typeof d.line === "number" &&
    typeof d.from === "string" &&
    typeof d.to === "string" &&
    typeof d.text === "string"
  );
}

export function newDraftKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Add a draft at `anchor` for `pair`; the caller persists the returned list. */
export function addDraft(drafts: ReviewDraft[], anchor: Anchor, pair: RefPair, text: string, now = new Date()): ReviewDraft[] {
  const ts = now.toISOString();
  return [
    ...drafts,
    { key: newDraftKey(), ...anchor, from: pair.from, to: pair.to, text, created_at: ts, updated_at: ts },
  ];
}

export function updateDraft(drafts: ReviewDraft[], key: string, text: string, now = new Date()): ReviewDraft[] {
  return drafts.map((d) => (d.key === key ? { ...d, text, updated_at: now.toISOString() } : d));
}

export function removeDrafts(drafts: ReviewDraft[], keys: Iterable<string>): ReviewDraft[] {
  const set = new Set(keys);
  return drafts.filter((d) => !set.has(d.key));
}

export function sameAnchor(a: Anchor, b: Anchor): boolean {
  return a.path === b.path && a.side === b.side && a.line === b.line;
}

/** The drafts written against exactly this pair (others stay stored, hidden from the diff body). */
export function draftsForPair(drafts: ReviewDraft[], pair: RefPair): ReviewDraft[] {
  return drafts.filter((d) => d.from === pair.from && d.to === pair.to);
}

/** The sent comments of this pair. */
export function sentForPair(comments: ReviewComment[] | undefined, pair: RefPair): ReviewComment[] {
  return (comments ?? []).filter((c) => c.from_ref === pair.from && c.to_ref === pair.to);
}

/**
 * The merged list for one pair, in diff order: by path (patch order given), then
 * line, then side (old before new — the left column first). Sent before draft on
 * the same anchor is impossible by construction (one comment per line), but a
 * stale draft on a line just sent still resolves deterministically: sent wins.
 */
export function mergeEntries(
  drafts: ReviewDraft[],
  comments: ReviewComment[] | undefined,
  pair: RefPair,
  pathOrder: string[],
): ReviewEntry[] {
  const order = new Map(pathOrder.map((p, i) => [p, i]));
  const rank = (p: string) => order.get(p) ?? Number.MAX_SAFE_INTEGER;
  const entries: ReviewEntry[] = [
    ...sentForPair(comments, pair).map<ReviewEntry>((c) => ({
      kind: "sent",
      anchor: { path: c.path, side: c.side, line: c.line },
      comment: c,
    })),
    ...draftsForPair(drafts, pair).map<ReviewEntry>((d) => ({
      kind: "draft",
      anchor: { path: d.path, side: d.side, line: d.line },
      draft: d,
    })),
  ];
  return entries.sort((a, b) => {
    const r = rank(a.anchor.path) - rank(b.anchor.path);
    if (r !== 0) return r;
    if (a.anchor.path !== b.anchor.path) return a.anchor.path < b.anchor.path ? -1 : 1;
    if (a.anchor.line !== b.anchor.line) return a.anchor.line - b.anchor.line;
    if (a.anchor.side !== b.anchor.side) return a.anchor.side === "old" ? -1 : 1;
    // Same anchor: sent first, so the page shows the immutable one.
    if (a.kind !== b.kind) return a.kind === "sent" ? -1 : 1;
    return 0;
  });
}

/** The entry anchored on this exact line, if any (the "one comment per line" lookup). */
export function entryAt(entries: ReviewEntry[], anchor: Anchor): ReviewEntry | undefined {
  return entries.find((e) => sameAnchor(e.anchor, anchor));
}

/** Per-file counts for the sidebar badges and the card headers. */
export function countsByPath(entries: ReviewEntry[]): Map<string, { drafts: number; sent: number }> {
  const m = new Map<string, { drafts: number; sent: number }>();
  for (const e of entries) {
    const c = m.get(e.anchor.path) ?? { drafts: 0, sent: 0 };
    if (e.kind === "draft") c.drafts += 1;
    else c.sent += 1;
    m.set(e.anchor.path, c);
  }
  return m;
}

/** `ReviewPage.tsx:R48` — basename, GitHub's side letter, line. */
export function anchorLabel(anchor: Anchor): string {
  const base = anchor.path.includes("/") ? anchor.path.slice(anchor.path.lastIndexOf("/") + 1) : anchor.path;
  return `${base}:${anchor.side === "old" ? "L" : "R"}${anchor.line}`;
}

/** `destination side` / `source side` — the header spells the side out. */
export function sideLabel(side: ReviewSide): string {
  return side === "new" ? "destination side" : "source side";
}

/** Drafts → the wire shape of the send endpoint. */
export function toSendInputs(drafts: ReviewDraft[]): SendReviewCommentInput[] {
  return drafts.map((d) => ({ path: d.path, side: d.side, line: d.line, from: d.from, to: d.to, text: d.text }));
}

/**
 * Why sending is disabled, or null when it is allowed. Mirrors the daemon's
 * `run_branch_gone` refusal so the buttons grey out *before* a click: an
 * archived Run has no branch; a `tip` ref whose SHA no longer resolves means
 * `pdo/run-<id>` was deleted.
 */
export function sendDisabledReason(run: Pick<RunState, "run_id" | "status"> | null, refs: RunRefs | null): string | null {
  if (!run) return null;
  const branch = `pdo/run-${run.run_id}`;
  if (run.status === "archived") {
    return `Run archived — branch ${branch} no longer exists. Comments stay readable; sending to the manager is disabled.`;
  }
  const tip = refs?.refs.find((r) => r.id === "tip");
  if (refs && tip && tip.sha === null) {
    return `Run branch ${branch} no longer exists — nothing for the manager to act on. Comments stay readable; sending is disabled.`;
  }
  return null;
}

/** `just now` / `3 min ago` / `14:05` — the cards' relative time. */
export function relativeTime(iso: string, now = new Date()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.round((now.getTime() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Pending for the Diff tab badge (CONTEXT.md « Accès rapide Review »): sent, not resolved. */
export function pendingCount(comments: ReviewComment[] | undefined): number {
  return (comments ?? []).filter((c) => c.status !== "resolved").length;
}

/** `2 drafts` / `1 draft` — pluralised counter. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
