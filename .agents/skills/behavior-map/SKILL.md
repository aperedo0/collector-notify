---
name: behavior-map
description: Read the codebase and maintain the three refactor-support ledgers — BEHAVIOR_MAP.md (intended functionality, the contract refactors preserve), SUSPECTED_BUGS.md (intended-vs-actual divergences awaiting user verdicts), and BACKLOG.md (the single ranked refactor queue). Use when asked to map the app's behavior, build or refresh the behavior map, update the refactor queue or backlog, or fold a finished refactor run back into the ledgers. Logs suspected bugs, never fixes them; never modifies production code, tests, migrations, or project files.
---

# Behavior Map

Read the repository agent instructions (`AGENTS.md` / `CLAUDE.md`) first.
This skill writes exactly three files, one purpose each, plus a one-time
`.gitignore` line — and touches nothing else.

## The three files

| File | Purpose | Git |
|---|---|---|
| `BEHAVIOR_MAP.md` (root) | Intended functionality only — what the system is supposed to do. No bugs, no queue, no implementation detail. | tracked |
| `SUSPECTED_BUGS.md` (root) | Divergences between what code is trying to do and what it currently does. | NEVER tracked — ensure the `.gitignore` line exists before first write |
| `BACKLOG.md` (root) | The single ranked refactor queue. | tracked |

## Map the behavior

1. Enumerate every entry point: user-facing screens and their navigation roots, HTTP routes, background loops and scheduled jobs, CLI commands, and event or message handlers. Cross-check against the repository's authoritative plan or feature overview. Every entry point gets a map entry; one without a map entry is a gap to fill, never to skip.
2. For each entry, read the code — never map from filenames, docs, or memory. Record at behavior altitude, 20–40 lines per entry: purpose in one line; each control or input → what it does; data in and out; state owner; side effects (persistence, network, notifications, scheduling). Link the matching design or feature document for implementation depth instead of duplicating it.
3. "Intended" means what the code is trying to do — evidenced by names, tests, docs, and structure — not what it currently does. Where the two differ, the map records the intended behavior with an `[SB-nn]` marker and the divergence goes to `SUSPECTED_BUGS.md`.
4. Stale claims found in the repository's documents are reported in chat, never edited.

Read-only reader subagents (one per feature area) may gather evidence; the
session merges their findings and writes all three files itself.

## Suspected bugs ledger

Entry format: `SB-nn — file:line — intended — actual — trigger — Verdict: OPEN`.

- Verdicts (`OPEN` / `REAL` / `FALSE POSITIVE` / `WONTFIX`) are set only by the user. Never re-flag or re-litigate a decided entry.
- NEVER fix a suspected bug. Refactor runs preserve them; fixes are separate, user-ordered tasks.
- Retirement: when a bug is fixed, delete its entry and its `[SB-nn]` map marker. `FALSE POSITIVE` and `WONTFIX` entries shrink to one line and stay forever — deleting them re-opens settled questions.

## The queue (BACKLOG.md)

On the first run, verify every existing item against current code, mark each
`DONE` or `STALE` with one-line evidence, and rewrite the file in the format
below. On later runs, maintain it in place.

Each target: `rank. <name> — <file cluster> — why now (churn <N>, blocks: <what>) — one-run proof — [PROTECTED]?`

- Rank by churn × how much the target blocks future work. Churn: `git log --since="3 months ago" --format= --name-only -- <source globs> | sort | uniq -c | sort -rn`.
- One-run bound: the target must be completable to a green full gate in a single `/refactor` run. Split anything larger before it enters the queue.
- Flag `[PROTECTED]` when the target touches a protected area (routing ladder in the repository agent instructions).

## Fold in a refactor run

After each `/refactor` run: mark its target `DONE — <branch>`, keep any queue
items the run appended, re-rank. Re-verify only the map entries whose entry
points the run touched — a behavior-preserving run should change nothing there;
confirm rather than rewrite.

## Finish

Summarize in chat: entries added or refreshed, new `SB` IDs awaiting verdicts,
queue changes, and the top 3 targets. Production code, tests, migrations, and
project files are untouchable under any circumstances.
