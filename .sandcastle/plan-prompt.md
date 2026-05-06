# ISSUES

Only AFK-ready issues are eligible for this run. They have been pre-triaged by a human and carry the `ready-for-agent` label. Issues without that label (e.g. `ready-for-human`, `needs-triage`, `needs-info`) are off-limits and must not appear in the plan.

Here are the open `ready-for-agent` issues in the repo:

<issues-json>

!`gh issue list --state open --label ready-for-agent --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

# TASK

Analyze the open `ready-for-agent` issues and select the subset that is **unblocked** right now and can therefore be worked on in parallel.

## Blocking — source of truth

Each issue body has a `## Blocked by` section that explicitly lists its blockers as `#<number>` references (or "None - can start immediately" if no blockers). **Trust this section as the source of truth** — do not re-derive blocking from "modify overlapping files" heuristics.

An issue is **unblocked** if and only if every `#<number>` listed in its `Blocked by` section refers to an issue that is **CLOSED** on GitHub. Note that a blocker may be labeled `ready-for-human` (still open, awaiting a human) — in that case the dependent issue stays blocked even if the dependent itself is `ready-for-agent`.

If you need to confirm a blocker's state, use `gh issue view <number> --json state,labels`.

For each unblocked issue, assign a branch name using the format `sandcastle/issue-{id}-{slug}`.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42-fix-auth-bug"}]}
</plan>

Include only unblocked `ready-for-agent` issues. If every `ready-for-agent` issue is blocked, return an empty array — the orchestration loop will exit cleanly.
