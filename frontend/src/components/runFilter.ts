import type { RunListEntry } from "../types";

/* #336 — the client-side filter model for the Runs list. Option sets are
   derived from the runs themselves (never from the live library/trigger
   stores) so runs of renamed or deleted pipelines/triggers stay filterable.
   The daemon already ships every axis on `GET /runs` (`effective_repo`,
   `pipeline_name`, `triggered_by`); filtering is a pure view-layer computation.

   This lives in its own module (#345) so `RunFilters.tsx` only exports a
   component: the non-component exports below (an object constant and a
   function) would otherwise break React Fast Refresh
   (`react-refresh/only-export-components`), mirroring the `highlightYaml`
   → `yamlHighlight.tsx` split. */

/** Sentinel filter values for rows whose axis key is absent/empty. */
export const MANUAL_TRIGGER = "__manual__";
export const NONE = "__none__";

export interface RunFilterValue {
  repo: string | null;
  pipeline: string | null;
  /** A trigger id, or MANUAL_TRIGGER for manually launched runs. */
  trigger: string | null;
  /**
   * #725 — whether runs started by another run (orchestrated children) are
   * listed. ON by default ("déplié par défaut", issue #725): a child parked
   * `awaiting_user` must stay visible, so hiding it is an explicit act.
   */
  showOrchestrated: boolean;
}

export const EMPTY_RUN_FILTER: RunFilterValue = {
  repo: null,
  pipeline: null,
  trigger: null,
  showOrchestrated: true,
};

/** The filter key for a run on each axis (empty/missing values bucket to a sentinel). */
export function repoKey(r: RunListEntry): string {
  return r.effective_repo && r.effective_repo.length > 0 ? r.effective_repo : NONE;
}
export function pipelineKey(r: RunListEntry): string {
  const name = r.pipeline_name ?? "";
  return name.trim().length > 0 ? name : NONE;
}
export function triggerKey(r: RunListEntry): string {
  return r.triggered_by ?? MANUAL_TRIGGER;
}

/** #725 — a root run is one no other run started. */
export function isRootRun(r: RunListEntry): boolean {
  return !r.parent_run_id;
}

/**
 * AND predicate over the four axes; a null axis means "All", and
 * `showOrchestrated: false` narrows the list to roots (#725).
 */
export function runMatchesFilter(r: RunListEntry, f: RunFilterValue): boolean {
  if (f.repo !== null && repoKey(r) !== f.repo) return false;
  if (f.pipeline !== null && pipelineKey(r) !== f.pipeline) return false;
  if (f.trigger !== null && triggerKey(r) !== f.trigger) return false;
  if (!f.showOrchestrated && !isRootRun(r)) return false;
  return true;
}

/**
 * True when at least one axis narrows the list — the condition for the strip's
 * clear ✕ (and the empty state's). #725 adds the orchestrated toggle to it, so
 * clearing resets the toggle to ON for free.
 */
export function isFilterActive(f: RunFilterValue): boolean {
  return f.repo !== null || f.pipeline !== null || f.trigger !== null || !f.showOrchestrated;
}
