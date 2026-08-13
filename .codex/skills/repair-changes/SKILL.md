---
name: repair-changes
description: Review a specified code change, confirm defects introduced by it, repair the confirmed defects, and verify the result. Use when the user explicitly asks to review and fix, QA and repair, or find and correct problems in uncommitted work, a diff, commit, branch, or pull request. Do not use for read-only review, new feature implementation, or unrelated pre-existing issues.
---

# Repair Changes

Keep the repair inside the reviewed target. Preserve unrelated working-tree
changes and follow any available repository instructions before editing.

## Resolve the target

Use the files, commit, branch, comparison base, or diff supplied by the user.
Otherwise use current uncommitted changes. If no trustworthy target exists,
stop instead of selecting history the user did not name. Record the exact scope
before making edits.

## Review and confirm

Inspect the complete target plus enough surrounding code, callers, tests, data
flow, and configuration to understand it. Look for concrete regressions in
correctness, security, reliability, performance, compatibility, and missing
tests.

Confirm each candidate from source evidence. Repair only when the issue is real,
actionable, and introduced or exposed by the reviewed target. Report pre-existing
or uncertain concerns without modifying them.

## Repair

State the root cause, affected files, smallest correction, and proving check.
Make only authorized fixes. Add a regression test when it provides reliable
coverage. Never discard, overwrite, stage, commit, or reformat unrelated work.
Stop for a missing product decision or a required scope expansion.

## Verify

Discover validation commands from repository instructions, manifests, task
runners, and continuous-integration configuration. Run the narrowest relevant
checks followed by the required full gate when practical. Distinguish failures
caused by the repair from environmental and pre-existing failures.

Report confirmed, repaired, refuted, and blocked findings; files changed; actual
checks and results; and remaining risks.
