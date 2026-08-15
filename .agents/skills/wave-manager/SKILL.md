---
name: wave-manager
description: Wave-based development workflow where the session plans and manages while fresh implementer subagents write all code, gated by a mandatory fresh-context review after every wave. Use this skill for development tasks in this codebase, including building features, adding functionality, fixing bugs, refactoring, and UI work. Do not use it for a repository-defined trivial self-service literal replacement unless the user explicitly asks the agent to perform that edit after receiving the manual instruction.
---

# Wave Manager

**Requires:** the `plan-code` and `plan-audit` skills, and the `wave-implementer` and `wave-reviewer` role definitions. Copying this skill without them leaves it inoperable.

## Trivial self-service exit

Before assuming the manager role, apply the repository's trivial self-service rule (`AGENTS.md`); when the repository defines none, treat one unambiguous literal replacement in one existing file, outside any protected area, as qualifying. If it qualifies, give the short manual instruction and stop without entering this workflow. An explicit follow-up asking the agent to perform that edit proceeds normally.

## Milestone authority comes first

When the repository's agent instructions place an authoritative plan above this skill, that plan's scope, stop gates, and per-milestone allowed paths bind every wave. This workflow decides HOW work is executed; it never decides WHAT is in scope. A wave that would touch an off-limits path, or start work the authority has not authorized, stops and goes to the user before dispatch.

## Your role: manage, never build

You are the manager. You never write production code, never run builds or tests, and never read build logs or full diffs — `wave-implementer` subagents do all heavy work and return proof. This keeps your context small and sharp for the entire task, whichever model you are.

Two hard dispatch rules:

- **One implementer at a time, always sequential.** Concurrent implementers corrupt shared generated artifacts — lockfiles, migration ledgers, generated clients, build caches — and produce interleaved diffs no reviewer can attribute.
- **Never paraphrase the plan into a dispatch.** Implementers read the plan file themselves; you pass pointers, not summaries.

The coding rules (readability, UI, tests) live in the `wave-implementer` role definition. The review criteria live in the `wave-reviewer` role definition. `AGENTS.md` names the file for each role. Do not restate them here or in dispatches.

## Step 1: Plan before touching anything

1. If an approved plan for this task already exists (the user points at a plan file in the repository's plan directory), consume it as-is: read it, skip `plan-code`, and go straight to presenting it for the approval gate. Otherwise plan via the `plan-code` skill (if you have no skill loader, read `.agents/skills/plan-code/SKILL.md` and follow it). The plan, from either source, defines the waves — do not build a second plan. Each wave section must be self-contained instructions for its implementer; that requirement is part of `plan-code`. Small tasks may be one wave; that is fine, the review gate still applies.
2. **UI work:** every mock or screenshot must exist as a file on disk, and the plan records its absolute path. If the user only pasted an image into chat, ask them for a file path before planning the UI work — pasted images can never reach subagents.
3. Present the wave plan to the user briefly before starting. One or two lines per wave.

   **Approval gate:** if the plan has 2 or more waves, or touches any protected area (the routing ladder in the repository agent instructions defines the list; when the repository defines none, treat authentication and session handling, persistence and migrations, security and authorization, and build, signing, or release configuration as protected), STOP after presenting the plan and wait for the user's explicit approval before any dispatch. Otherwise, present the plan and proceed immediately.
4. Once the plan is approved (or immediately, for plans that proceed without the gate), write it verbatim to `<plan-directory>/<YYYY-MM-DD>-<task-slug>.md`, using the plan directory `AGENTS.md` names. This file is the single source of truth: implementers read it directly, the reviewer audits against it, and you append a Progress Log to it. Planning-only requests never write this file. If the plan changes mid-task with the user's agreement, update the file before dispatching further.
5. **Audit gate:** a normal-workflow plan must carry a `## Audit Log` whose final line is a `CONVERGED` line — or an explicit user override recorded in the log (e.g. `CAPPED — user approved proceeding`, or `SKIPPED — user directed`, which the manager appends on the user's order) — before any wave dispatches. A plan whose routing header claims the repository's simplicity exemption — with the manager re-checking each criterion before dispatch — takes the sanctioned final line `SKIPPED — simplicity exemption`, appended by the manager at approval with no separate user order; for these plans the user's plan approval IS the dispatch trigger and the post-audit go below does not apply. If the plan file lacks an Audit Log, whether the plan arrived pre-written or was just saved in item 4, invoke the `plan-audit` skill on it now and present its convergence summary. Audit depth follows the routing ladder: a Normal — Standard plan takes plan-audit's light audit (one combined round); a Normal — Full plan takes the full pipeline. When the repository defines no ladder, take the full pipeline. **For any non-exempt normal-workflow plan, a user go after its audit — whether the audit ran here or before this workflow was invoked — is the dispatch trigger; this supersedes item 3's proceed-immediately path.** Never dispatch an un-audited normal-workflow plan. If the plan changes materially mid-task, the changed sections re-enter `plan-audit` (one Phase B verify round covering the changed sections) before the next wave dispatches; trivial amendments proceed with user agreement as today. A light-lane task promoted by the final-diff rule re-enters here with code already written: the plan saved at item 4 must cover both the changed code and any remaining work, and it takes the scoped path — one Phase B verify round (R1 lens, walked against the existing diff), recorded in the plan's `## Audit Log` — before the review gate or any further wave dispatch; the full Phase A improve loop never runs retroactively on implemented code. Light lanes are otherwise exempt.

### Decision protocol

- **Obvious decisions** (naming, file placement, which existing pattern to reuse, standard implementation choices): decide by mirroring how the codebase already does it. Do not interrupt the user.
- **Genuinely ambiguous decisions** (product behavior, UX flows with multiple reasonable options, anything that changes what the user asked for, schema or data migrations, anything destructive): stop and ask before proceeding. Ask specific questions with your recommended option stated.

### Light lanes

Two routes skip `plan-code`, the plan file, and the reviewer spawn. Both require: no protected areas (per the routing ladder in the repository agent instructions, or the default above) and no unresolved product or UX decisions.

- **Small task** — a single file, and the behavior change is exactly what the user asked for (a one-line bug fix, a permanent log statement — temporary diagnostic logging is handled directly per the repository instructions, outside this workflow).
- **Presentation lane** — a looks-only change to existing screens, any number of files: views, screen-local styling, assets, copy, animations, and local presentation logic. No intended behavior change, no navigation-architecture changes, and no edits to existing shared design-system tokens (adding new tokens is fine). A restyle from a mock qualifies; the mock must exist as a file on disk per Step 1. When a change qualifies for both routes, use the presentation lane.

For either route: dispatch ONE `wave-implementer` with the task description (and mock path, if any) as its spec, naming the route, and instructing it to also self-review against the checklist in the `wave-reviewer` role definition and include the verdicts in its report. Record the `git status --porcelain` baseline before dispatch and verify its report against that comparison yourself; no separate reviewer spawn. For a presentation-lane task, open the mock and the returned screenshot and judge the match with your own eyes — that comparison is the lane's primary gate.

**The final diff decides the lane, not the intent.** If the baseline comparison shows any file outside the route's limits — a second file for a small task; a shared module, service, schema, migration, or existing-token edit for the presentation lane — promote the task to the normal workflow starting at Step 1, and the full gate then applies to everything already changed.

## Step 2: Dispatch one wave at a time

Spawn the `wave-implementer` subagent with exactly:

- the plan file path and which wave it is building
- the list of files touched so far in this task
- the absolute paths of mock image files (UI waves)

Immediately before dispatching, record `git status --porcelain` as the wave's baseline.

When its report returns, verify before anything else:

- The report is one of the two sanctioned formats: a BLOCKED report (a blocking question — no proof lines required, the gate never runs on unfinished work) or a completed report carrying the verbatim output of every command in the repository's documented build-and-test gate, with deviations and questions stated. A presentation-lane dispatch may replace the test line with "tests skipped — presentation lane, no logic changed".
- Run `git status --porcelain` again and compare with the wave's baseline: every file that appeared or changed must be planned for this wave. The comparison catches new untracked files (invisible to `git diff`) and keeps pre-existing dirty files out of the check. Investigate any extra file before accepting.
- UI wave: open the mock file and the returned screenshot yourself and judge the match with your own eyes.

If the implementer returns a question: answer it from the plan if the plan answers it; product-behavior questions go to the user. Send the answer back to the SAME implementer — do not spawn a fresh one; its implementation context is the asset.

## Step 3: Review gate (mandatory, after EVERY wave)

When a wave's report is verified, spawn the `wave-reviewer` subagent. This is non-negotiable and applies even to single-wave tasks (except qualifying light-lane tasks, which use the self-review from that section). The reviewer runs with a fresh context on purpose: it must judge the code the way a stranger would.

Pass the reviewer:

- The path to the plan file in the repository's plan directory, and which wave this is
- The goal of the wave in one paragraph
- The full list of files created or modified in this wave
- The list of ALL files touched at any point during this task (for regression checking)
- The implementer's verbatim proof lines from its report
- Whether this is the task's FINAL wave, and whether the task's single independent gate run has already happened (it belongs to the first passing final-wave round — the reviewer's own rules govern when it runs the gate)

Then:

- The reviewer is read-only: it verifies the implementer's proof instead of re-running a green gate, and reports every issue back — big and small — fixing nothing itself.
- Send every big issue to the SAME implementer to fix; it must re-run its build-and-test gate and return updated proof lines. Fold any reported small issues into that same dispatch.
- If big issues were found and fixed, spawn the reviewer again on the fixes, passing the fresh proof lines.
- Small issues alone never block a wave or trigger another reviewer round: batch them into the implementer's next dispatch, or into one cleanup dispatch before the conformance pass if no wave remains (its gate re-run rules are unchanged). Because nothing after a cleanup dispatch would otherwise look at its code, spawn the reviewer once on the cleanup diff before the conformance pass; that round sits outside the per-wave cap.
- Reviewer **Notes** are never dispatched: record them in the plan's Progress Log and surface them in the final summary — the user decides their fate. A cleanup dispatch fires only when a genuine Small remains unbatched; when only Notes remain, go straight to the conformance pass.
- **Cap: maximum 3 reviewer rounds per wave.** If the third round still reports big issues, STOP and surface the remaining issues to the user instead of looping further.
- Only when the reviewer passes the wave do you append to the plan file's Progress Log — `Wave N: PASS — reviewer rounds <R>, files: <list>` — and start the next wave. Never proceed on a failed review.

## Step 4: Plan-conformance pass (after the final wave)

After the final wave passes review, re-read the plan file and walk it item by item: for each wave and each planned deliverable, state **PASS** (delivered as planned) or **DEVIATION** (what differs and why). A deviation is not automatically a failure, but an unreported one is. If a deliverable was silently dropped or the behavior differs from the plan without the user having agreed to the change, have the implementer fix it or ask before summarizing.

Then give the user a short summary: what was built per wave, the conformance result for every plan item, what the reviewer caught, the implementers' proof lines, and anything they should know. When the repository's authoritative plan requires a milestone completion report, produce it in that exact format from these results.
