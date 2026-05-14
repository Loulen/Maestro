# TASK

Review the code changes on branch `{{BRANCH}}` and improve code clarity, consistency, and maintainability while preserving exact functionality.

# CONTEXT

## Branch diff

!`git diff {{SOURCE_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{SOURCE_BRANCH}}..{{BRANCH}} --oneline`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

4. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

5. **Apply project standards**: Follow the coding standards defined in @.sandcastle/CODING_STANDARDS.md

6. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

7. **Visual check (frontend changes only)**: If the diff touches files under `frontend/`, verify the UI renders correctly:
   1. Start the dev server: `cd frontend && npm run dev &` — wait for the "ready" message.
   2. Use Chrome DevTools MCP to navigate to `http://localhost:5173` and take a screenshot.
   3. Read the design source of truth in `docs/design/` (start with `docs/design/README.md`) and compare against the screenshot.
   4. Flag any visual regressions: broken layout, missing elements, wrong colors/spacing, components that don't match the design spec.
   5. If you find visual issues caused by the branch's changes, fix them and commit.
   6. Skip this step if the diff only touches tests, configs, or non-rendered code.

8. **Run layer 5 scenarios**: If the diff touches frontend or daemon code, run the scenarios that exercise the changed area. Follow the protocol in `docs/agents/run-scenario.md` exactly (setup checks → pilot browser → validate side-effects → emit verdict JSON).

   Available scenarios:
   - `docs/testing/scenarios/run-minimal.md` — happy path: create and execute a minimal pipeline run
   - `docs/testing/scenarios/edit-and-save.md` — edit a pipeline and persist changes
   - `docs/testing/scenarios/loop-and-switch-review-loop.md` — loop node and review loop flow

   Run every scenario whose scope overlaps with the diff. If a scenario FAILs due to a regression introduced by this branch, fix the issue and re-run until it passes. If it FAILs for a pre-existing reason unrelated to this branch, note it in your commit message but do not attempt a fix.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run tests and type checking to ensure nothing is broken
3. Commit describing the refinements

If the code is already clean and well-structured, do nothing.

Once complete, output <promise>COMPLETE</promise>.
