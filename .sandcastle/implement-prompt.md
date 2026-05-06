# TASK

Implement issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view {{TASK_ID}} --comments`. It has a parent PRD (issue #1) — read that too: `gh issue view 1`.

Only work on the issue specified.

Work on branch `{{BRANCH}}`. Make commits and run tests.

# CONTEXT

Read these before starting (they are the source of truth for this project):

- `@CONTEXT.md` — domain glossary and design decisions
- `@.sandcastle/CODING_STANDARDS.md` — Rust + TS conventions, build/test commands

Also relevant depending on the area you're touching:

- `docs/adr/0001-sharp-tool-not-safe-tool.md`
- `docs/adr/0002-mechanical-conditionals-only.md`
- `docs/adr/0003-stack-rust-react-xyflow.md`
- `docs/design/` — HTML/CSS/JS prototype as the visual source of truth (read `docs/design/README.md` first)
- `docs/design-brief.md` — the prompt that produced the design

Here are the last 10 commits for context:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information. Pay extra attention to:

- The issue's acceptance criteria — they define "done".
- Test files that touch the relevant parts of the code.
- Existing modules that your change interacts with (don't reinvent — extend or compose).

# EXECUTION

Use **red-green-refactor** to land code:

1. RED: write one test that captures the next slice of behavior from the acceptance criteria.
2. GREEN: write the minimum code to make it pass.
3. REPEAT until all acceptance criteria are covered by tests.
4. REFACTOR: tighten naming, remove duplication, ensure deep modules stay deep.

The PRD mandates tests for all deep modules. Do not skip them.

# FEEDBACK LOOPS

Before committing, run the appropriate commands from `@.sandcastle/CODING_STANDARDS.md` ("Build / test commands" section). Run only what is relevant to your diff (Rust commands if you touched Rust, frontend commands if you touched the frontend, both if both).

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix.
2. Reference the issue (`refs #{{TASK_ID}}`) and the parent PRD (`refs #1`).
3. State what was implemented and key decisions made.
4. List files changed.
5. Note any blockers or follow-up needed for the next iteration.

Keep it concise.

# ON THE ISSUE

If the work is **incomplete** at the end of this iteration, leave a comment on the issue summarizing what was done and what remains.

Do **not** close the issue — that happens during the merge phase.

Once your work for this iteration is done (whether complete or partial), output `<promise>COMPLETE</promise>`.

# FINAL RULES

ONLY WORK ON THE SINGLE ISSUE SPECIFIED. Do not refactor unrelated code, do not "fix" things you notice in passing — open a follow-up issue if you find something. Sharp-tool philosophy: do exactly what the spec asks, no more.
