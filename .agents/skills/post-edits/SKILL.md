---
name: post-edits
description: Review and automatically fix bugs in uncommitted work after finishing a round of edits. Use when the user asks for post edits, to review or QA what was just built, to find bugs in recent uncommitted work, or to deep-audit a diff, branch, or PR. Snapshots the worktree before editing, confirms findings, fixes every confirmed issue, then runs all documented builds and tests. Do not use for new implementation work, or for visual mock-comparison checks — those get an inline screenshot comparison instead.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Post Edits — autonomous review-and-fix loop

**Requires:** the `health-reviewer` and `bug-confirmer` criteria files.

Read the repository's agent instructions (`AGENTS.md` / `CLAUDE.md`) first. Run
the review and confirmation inline, sequentially, without subagents. After one
request for essential missing review context, proceed autonomously. Keep
findings, verdicts, and fix plans in chat, never on disk.

## 1. Resolve the review target

This skill's home ground is uncommitted work. Choose the target in this order:

1. Use files, commits, or a base range supplied by the user. For a branch or PR
   audit, compare its merge base with the requested base branch.
2. Otherwise, take all uncommitted work: tracked changes against `HEAD`, plus
   untracked files as newly added full files. Exclude any path the repository
   instructions mark as excluded from review.
3. Otherwise — the tree is clean and no target was named — stop and report that
   there is nothing uncommitted to review. Never fall back to reviewing commits
   the user did not point at.

Ask once only if no trustworthy base can be derived. Record the exact range and
file list. Stop if the target contains no files.

Read the Health-Check Scopes table in the repository's agent instructions; when
the repository defines none, treat every changed file as one general
correctness scope. For a
post-edits review, run the matching scopes; a target file matching no scope still
gets a general correctness review — scopes add focus, they never remove files
from the target. For a deep, branch, PR, or full-diff audit, run every scope
against the requested target.

## 2. Health check

Read the `health-reviewer` criteria file that `AGENTS.md` names, once. Review each applicable scope and
file in the main context. Show concise evidence and conclusions, not private
chain-of-thought. Publish one compact list with stable IDs, severity, scope,
file:line, trigger, and user impact. If there are no findings, go to Verify.

## 3. Confirm

Read the `bug-confirmer` criteria file that `AGENTS.md` names. Re-read every citation, trace control and
data flow, and verify that the change caused or exposed the issue. Publish the
verdict, confidence, and decisive evidence for each ID.

- `CONFIRMED`: automatically fix the whole finding.
- `PARTIAL`: automatically fix only the independently confirmed component.
- `REFUTED`: never modify code for it.

If nothing is fixable, go to Verify.

## 4. Plan every fix

Before editing, publish `## Fix Plan - iteration <N>`. For each fixable finding,
state:

- the traced root cause;
- exact files and symbols, with the smallest behavior-preserving change;
- the regression test or deterministic repro that will prove the fix;
- affected callers, state ownership, persistence, concurrency, and relevant
  repository invariants;
- execution order when fixes depend on one another.

Then run the plan gate. Every edit must map to confirmed evidence; the plan must
have zero unresolved behavior choices, cover every affected path, preserve all
repository invariants, and contain no unrelated cleanup. Re-read the relevant
code, challenge the strongest plausible failure mode, and verify that a senior
engineer with no prior context could implement it without guessing. Revise until
every check passes. Publish `PLAN GATE: PASS`, then proceed immediately without
asking for approval.

If a confirmed finding still requires a genuinely missing product decision
after repository investigation, abort and surface that blocker. Never guess and
never silently defer a confirmed finding. A fix that would need a change the
repository's authoritative plan does not authorize — a schema change, a new
dependency, a new environment variable — is a blocker, not a fix.

## 5. Snapshot, fix, re-review

Before the first edit of the run, snapshot the pre-fix worktree to the session
scratchpad: write `git diff HEAD --binary` output to `post-edits-snapshot.patch`,
copy every untracked target file into `post-edits-untracked/` preserving relative
paths, then print both locations and the per-file restore recipe
(`git checkout HEAD -- <file> && git apply --include=<file> <patch>`). Never
modify or delete the snapshot afterward.

Implement the validated plan exactly. Add a regression test first when practical.
If a necessary file falls outside the plan, update the plan and pass the gate
again before editing it. Allow at most three scope expansions per run; abort
before a fourth.

Run every planned regression check. Report each fixed ID and its proof, increment
the review repair-round counter, then repeat Health Check on the full accumulated
change. Allow at most three review repair rounds. After the third repair, run one
final health check; if it still produces a fixable verdict, abort instead of
starting a fourth repair.

## 6. Verify

Run the repository's documented build-and-test gate in full, strictly
sequentially and in documented order. Require the literal success output of every
command in it.

A build or test failure is evidence, not automatic attribution. If its source
proves that the review target or a loop fix caused it, treat it as auto-confirmed
and send it through Plan and Fix. Treat an environmental or unrelated pre-existing
failure as a blocker, not as permission to modify unrelated code. After a repair,
repeat the health check and the entire verification gate. Allow at most three
verification repair rounds; abort if the third repair still fails.

Finish with counts for `CONFIRMED`, `PARTIAL`, and `REFUTED`; fixed and blocked
IDs; scope expansions; repair rounds; and the verbatim output of every gate
command. Print `POST EDITS COMPLETE.`

Every abort must use `## POST EDITS ABORT - <reason>`, describe the remaining
issue and current worktree state, and leave existing changes intact.
