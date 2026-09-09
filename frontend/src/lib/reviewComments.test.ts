import { describe, it, expect } from "vitest";
import {
  addDraft,
  anchorLabel,
  countsByPath,
  draftsForPair,
  entryAt,
  mergeEntries,
  pendingCount,
  readDrafts,
  relativeTime,
  removeDrafts,
  sendDisabledReason,
  toSendInputs,
  updateDraft,
  wipKey,
  writeDrafts,
} from "./reviewComments";
import type { ReviewComment, RunRefs } from "../types";

const PAIR = { from: "fork", to: "tip" };

function sent(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "rc-001",
    path: "b.ts",
    side: "new",
    line: 5,
    from_ref: "fork",
    to_ref: "tip",
    text: "t",
    author: "user",
    sent_at: "2026-09-09T10:00:00Z",
    status: "sent",
    ...overrides,
  };
}

describe("reviewComments (#750)", () => {
  it("round-trips drafts through storage and drops garbage", () => {
    localStorage.clear();
    let drafts = addDraft([], { path: "a.ts", side: "new", line: 3 }, PAIR, "hello");
    drafts = addDraft(drafts, { path: "a.ts", side: "old", line: 1 }, PAIR, "old side");
    writeDrafts("r1", drafts);
    expect(readDrafts("r1")).toEqual(drafts);
    expect(readDrafts("r2")).toEqual([]);
    localStorage.setItem("pdo.review.drafts.r3", JSON.stringify([{ nope: 1 }, drafts[0]]));
    expect(readDrafts("r3")).toEqual([drafts[0]]);
    localStorage.setItem("pdo.review.drafts.r4", "{not json");
    expect(readDrafts("r4")).toEqual([]);
    writeDrafts("r1", []);
    expect(localStorage.getItem("pdo.review.drafts.r1")).toBeNull();
  });

  it("updates and removes by key; keys are unique", () => {
    let drafts = addDraft([], { path: "a.ts", side: "new", line: 3 }, PAIR, "a");
    drafts = addDraft(drafts, { path: "a.ts", side: "new", line: 4 }, PAIR, "b");
    expect(drafts[0].key).not.toBe(drafts[1].key);
    const upd = updateDraft(drafts, drafts[0].key, "A");
    expect(upd[0].text).toBe("A");
    expect(upd[1].text).toBe("b");
    expect(removeDrafts(upd, [drafts[1].key])).toHaveLength(1);
  });

  it("merges drafts and sent comments of the pair in diff order, sent first on a shared line", () => {
    const drafts = [
      ...addDraft([], { path: "b.ts", side: "new", line: 9 }, PAIR, "late"),
      ...addDraft([], { path: "a.ts", side: "new", line: 2 }, PAIR, "early"),
      ...addDraft([], { path: "a.ts", side: "old", line: 2 }, PAIR, "left"),
      ...addDraft([], { path: "a.ts", side: "new", line: 1 }, { from: "fork", to: "node:x:1:after" }, "other pair"),
      ...addDraft([], { path: "b.ts", side: "new", line: 5 }, PAIR, "stale"),
    ];
    const entries = mergeEntries(drafts, [sent()], PAIR, ["a.ts", "b.ts"]);
    expect(entries.map((e) => `${e.kind}:${anchorLabel(e.anchor)}`)).toEqual([
      "draft:a.ts:L2",
      "draft:a.ts:R2",
      "sent:b.ts:R5",
      "draft:b.ts:R5",
      "draft:b.ts:R9",
    ]);
    expect(entryAt(entries, { path: "b.ts", side: "new", line: 5 })?.kind).toBe("sent");
    expect(entryAt(entries, { path: "zz", side: "new", line: 5 })).toBeUndefined();
    expect(draftsForPair(drafts, PAIR)).toHaveLength(4);
    const counts = countsByPath(entries);
    expect(counts.get("a.ts")).toEqual({ drafts: 2, sent: 0 });
    expect(counts.get("b.ts")).toEqual({ drafts: 2, sent: 1 });
  });

  it("labels anchors GitHub-style and builds the wire inputs", () => {
    expect(anchorLabel({ path: "frontend/src/pages/ReviewPage.tsx", side: "new", line: 48 })).toBe("ReviewPage.tsx:R48");
    expect(anchorLabel({ path: "review.rs", side: "old", line: 123 })).toBe("review.rs:L123");
    const drafts = addDraft([], { path: "a.ts", side: "new", line: 3 }, PAIR, "x");
    expect(toSendInputs(drafts)).toEqual([{ path: "a.ts", side: "new", line: 3, from: "fork", to: "tip", text: "x" }]);
    expect(wipKey("r1", { path: "a.ts", side: "new", line: 3 }, PAIR)).toBe("pdo.review.wip.r1|a.ts|new|3|fork|tip");
  });

  it("explains why sending is disabled: archived, or a tip that no longer resolves", () => {
    const refs: RunRefs = {
      default_from: "fork",
      default_to: "tip",
      deliveries: [],
      refs: [
        { id: "fork", kind: "fork", label: "Fork point", git_ref: "a", sha: "a" },
        { id: "tip", kind: "tip", label: "Run tip", git_ref: "pdo/run-r1", sha: "b" },
      ],
    };
    expect(sendDisabledReason(null, refs)).toBeNull();
    expect(sendDisabledReason({ run_id: "r1", status: "completed" }, refs)).toBeNull();
    expect(sendDisabledReason({ run_id: "r1", status: "completed" }, null)).toBeNull();
    expect(sendDisabledReason({ run_id: "r1", status: "archived" }, refs)).toContain("pdo/run-r1");
    const gone = { ...refs, refs: refs.refs.map((r) => (r.id === "tip" ? { ...r, sha: null } : r)) };
    expect(sendDisabledReason({ run_id: "r1", status: "completed" }, gone)).toContain("no longer exists");
  });

  it("counts pending (sent, unresolved) comments and formats relative time", () => {
    expect(pendingCount(undefined)).toBe(0);
    expect(pendingCount([sent(), sent({ id: "rc-002", status: "resolved" })])).toBe(1);
    const now = new Date("2026-09-09T10:10:00Z");
    expect(relativeTime("2026-09-09T10:09:50Z", now)).toBe("just now");
    expect(relativeTime("2026-09-09T10:05:00Z", now)).toBe("5 min ago");
    expect(relativeTime("garbage", now)).toBe("");
    expect(relativeTime("2026-09-09T08:00:00Z", now)).toMatch(/\d/);
  });
});
