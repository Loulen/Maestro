# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`.
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution.
3. After resolving conflicts, run the appropriate test/check commands from `@.sandcastle/CODING_STANDARDS.md` (the "Build / test commands" section). Run only what is relevant to the merged diff (Rust commands if Rust changed, frontend commands if frontend changed, both if both).
4. If tests fail, fix the issues before proceeding to the next branch.

After all branches are merged, make a single commit summarizing the merge.

# CLOSE ISSUES

For each branch that was merged, close its issue with:

`gh issue close <ID> --comment "Completed by Sandcastle"`

Here are all the issues:

{{ISSUES}}

Closing an issue removes it from the planner's `--label ready-for-agent --state open` filter on the next iteration, which naturally unblocks any downstream issues that were waiting on it.

Once you've merged everything you can, output `<promise>COMPLETE</promise>`.
