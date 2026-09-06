import { describe, it, expect } from "vitest";
import {
  EMPTY_RUN_FILTER,
  isFilterActive,
  isRootRun,
  runMatchesFilter,
  type RunFilterValue,
} from "./runFilter";
import type { RunListEntry } from "../types";

/* #725 — the fourth filter axis. `showOrchestrated: false` narrows the list to
   root runs (no `parent_run_id`); it composes with the three #336 axes with AND
   semantics and is part of `isFilterActive`, so the strip's clear ✕ resets it. */

const run = (over: Partial<RunListEntry>): RunListEntry => ({
  run_id: "r",
  pipeline_name: "p",
  status: "running",
  started_at: null,
  ...over,
});

const root = run({ run_id: "root" });
const child = run({ run_id: "child", parent_run_id: "root" });

describe("runFilter #725 — showOrchestrated axis", () => {
  it("defaults to showing orchestrated runs (EMPTY_RUN_FILTER)", () => {
    expect(EMPTY_RUN_FILTER.showOrchestrated).toBe(true);
    expect(runMatchesFilter(child, EMPTY_RUN_FILTER)).toBe(true);
    expect(runMatchesFilter(root, EMPTY_RUN_FILTER)).toBe(true);
  });

  it("classifies roots and children from parent_run_id", () => {
    expect(isRootRun(root)).toBe(true);
    expect(isRootRun(child)).toBe(false);
    // A null parent id (daemon ships the field on every entry) is still a root.
    expect(isRootRun(run({ parent_run_id: null }))).toBe(true);
  });

  it("hides children and keeps roots when showOrchestrated is false", () => {
    const f: RunFilterValue = { ...EMPTY_RUN_FILTER, showOrchestrated: false };
    expect(runMatchesFilter(child, f)).toBe(false);
    expect(runMatchesFilter(root, f)).toBe(true);
  });

  it("composes with the other axes with AND semantics", () => {
    const alpha = run({ run_id: "a", effective_repo: "/repos/alpha", parent_run_id: "root" });
    const f: RunFilterValue = {
      repo: "/repos/alpha",
      pipeline: null,
      trigger: null,
      showOrchestrated: false,
    };
    // Matches the repo axis but is a child ⇒ filtered out.
    expect(runMatchesFilter(alpha, f)).toBe(false);
    // Relax the toggle ⇒ visible again.
    expect(runMatchesFilter(alpha, { ...f, showOrchestrated: true })).toBe(true);
  });

  it("reports the toggle in isFilterActive so the clear ✕ resets it", () => {
    expect(isFilterActive(EMPTY_RUN_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_RUN_FILTER, showOrchestrated: false })).toBe(true);
    expect(isFilterActive({ ...EMPTY_RUN_FILTER, repo: "/repos/x" })).toBe(true);
  });
});
