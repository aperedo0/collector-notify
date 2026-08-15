---
name: refactor
description: Execute exactly one bounded refactor target from BACKLOG.md's ranked queue — behavior-preserving, stepwise with tests after every step, run by one fresh implementer subagent and audited by a fresh reviewer, everything left uncommitted for the user. Use when asked to refactor a queue target, run the next refactor, or work through the backlog. Never for new features, bug fixes, or rewrites; a refactor request not tied to a queue target routes through the repository routing ladder instead.
---

# Refactor

The session manages and never writes production code; one fresh implementer
subagent executes the whole run; one fresh reviewer audits it. Read the
repository agent instructions (`AGENTS.md` / `CLAUDE.md`) first — their git
rules stand: this skill never creates branches and never commits.

## Preconditions — block if any fails

1. Clean working tree (`git status --porcelain` empty).
2. The user has created and checked out a dedicated branch for this run. If on `main` or a shared work branch, STOP and ask the user to branch — never branch for them. The run's undo unit is the uncommitted diff on that branch.
3. `BACKLOG.md` has a ranked queue. Otherwise STOP and offer `/behavior-map` first.
4. Exactly one target, fixed before dispatch: the one the user named, else rank 1 confirmed with the user.
5. A `[PROTECTED]` target needs the user's explicit go for this run.

Record `git status --porcelain` as the baseline (it must be empty), then dispatch.

## Dispatch — one implementer, whole run

Spawn ONE fresh `wave-implementer` (definition: `.claude/agents/wave-implementer.md`) whose spec is: the target entry verbatim from `BACKLOG.md`; the paths of `BEHAVIOR_MAP.md`, `SUSPECTED_BUGS.md`, and its step log `.claude/refactor-logs/<YYYY-MM-DD>-<target-slug>.md`; and the run rules below, passed in full.

**Run rules for the implementer:**

- **Step 0 — baseline.** Run the repository's documented test command. Any failure → return BLOCKED; never refactor on red.
- **Coverage gate.** If no tests exercise the target, first write characterization tests pinning ACTUAL behavior — including every `SUSPECTED_BUGS.md` entry touching these files — per the repository test conventions. Run them green, then return a report WITHOUT refactoring. (Manager: present the tests to the user; on their go, resume the SAME implementer — its context is the asset.)
- **Stepwise loop.** Before each step, append a numbered entry to the step log: intent, files. After each step, run the narrowest test scope that covers the target; a step that moves, renames, or splits a file shared across packages or build targets also runs the full documented gate — one package's tests can stay green while a dependent target breaks.
- **Checkpoint on green:** `git add -A`. **On red:** discard all unstaged changes, delete any files the failed step created (its log entry lists them), mark the entry FAILED with the error, and try a different approach once. The same step failing twice → stop and return the report with the log.
- **Scope.** One target. Adjacent problems become one-line `BACKLOG.md` queue entries, appended and left alone. Suspected bugs are preserved exactly — a run that "fixes" one has changed behavior and failed.
- **Finish.** Run the repository's documented full gate in its documented order. Mark the target `DONE — <branch>` in `BACKLOG.md`. Leave everything uncommitted (staged is fine). Report: verbatim proof lines, step log path, files changed, queue items appended, and a suggested commit message referencing the step log.

## Stop conditions

- Stop when the next change to this code would be easy — not when it is perfect.
- The target turns out to need a design decision the user has not made (behavior, data shape, architecture) → STOP and surface it with a recommendation; never guess.
- A BLOCKED report goes to the user verbatim with the step log path — the log tells them which step broke.

## Review gate — mandatory

Verify the implementer's report first: proof lines present, and `git status
--porcelain` versus the baseline shows only the target cluster, tests, the
step log, and `BACKLOG.md`. Then spawn a fresh `wave-reviewer` (definition:
`.claude/agents/wave-reviewer.md`) with the target entry, the three ledger
paths, the step log, the file list, and the proof lines. Its lens, in order:

1. Behavior identical — against `BEHAVIOR_MAP.md`'s entries, with every `SUSPECTED_BUGS.md` divergence still present.
2. The junior test: is the result genuinely easier for a junior engineer new to this stack to read and follow?
3. Scope: nothing beyond the target; no anti-pattern below.

Big issues → the SAME implementer fixes and re-gates with fresh proof, then
re-review. Cap: 3 reviewer rounds; a third failing round STOPS the run and
surfaces the issues to the user.

## Report

What changed and why it reads simpler, the verbatim proof lines, the step log
path, `BACKLOG.md`'s new state, the suggested commit message, and — for
user-facing view targets — before/after screenshots when the screen is
reachable, else a manual-smoke-pending note. The user commits.

## Anti-patterns — hard no

1. No new features.
2. No bug fixes — divergences go to `SUSPECTED_BUGS.md`, even mid-run discoveries.
3. Never delete or weaken a failing test to make it pass.
4. No rewriting when asked to refactor.
5. No abstraction for a single caller — and none before the third repetition.
6. No schema, migration, or generated-artifact regeneration — a behavior-preserving refactor never edits the migration ledger.
7. No formatting-only churn outside the target's files.
8. No new dependencies. A refactor that needs one is a design decision for the user.

## What "better" means

1. A junior engineer new to this stack can open the result, read it, and understand it. Amazing, never over-engineered.
2. Names carry meaning; comments explain why, never what; one level of abstraction per function.
3. Low coupling, high cohesion, side effects at the edges; logic depends on interfaces, never on infrastructure.
4. Feels instant: no blocking work on the interactive path, minimal repeated computation, bounded allocation, lazy loading, list reuse — and measurement evidence before any optimization.
5. Idiomatic for the language and framework in use; plain code over clever code; platform conventions followed.
