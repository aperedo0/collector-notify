---
name: plan-audit
description: The standalone pipeline stage between planning and implementation — first improve an approved plan (fresh critics iterate until they call it solid), then adversarially verify it against the codebase (fresh reviewers loop until a round finds no blockers). Fixes land in the plan file and an Audit Log is appended; the implementation workflow consumes the audited file. Use after a plan is approved for implementation and before any wave is dispatched, for all normal-workflow work — new features, major reworks, refactors, multi-wave programs; trivial and presentation lanes skip it, and plans carrying the repository's simplicity exemption skip this skill entirely and never invoke it. Audit depth follows the repository routing ladder: one combined light-audit round for Normal — Standard, the full improve/verify pipeline for Normal — Full. Also use for direct requests to audit, stress-test, or "run the loop" on a plan. Never modifies production code.
---

# Plan Audit

The stage between planning and implementation:
plan → **improve → verify** → wave-based implementation.

**Agent assignment:** plan authorship and round adjudication stay with the
session. Every dispatched critic and reviewer runs as a fresh, read-only
agent at the repository's implementation tier — see the agent-tier note in
the repository's agent instructions. Deviate only on an explicit user order
for a specific round.

## Step 0 — put the plan on disk

Reviewers cannot see the conversation. If the approved plan is not yet a
file, write it verbatim to `.claude/plans/<YYYY-MM-DD>-<task-slug>.md`.
That file is the audit's subject, the only file this skill ever edits, and
the artifact the implementation workflow consumes. Production code, tests,
migrations, and project files are untouchable here.

## Audit sizing

The routing ladder in the repository agent instructions sizes the audit. A
**Normal — Full** plan runs Phase A and Phase B below unchanged. A
**Normal — Standard** plan (single wave, confined to the lane the ladder
defines, no protected areas) runs the **light audit** instead of both
phases:

1. Dispatch ONE fresh, read-only reviewer with a single combined prompt:
   the Phase A improve lens plus Phase B's R1 and R2 lenses, the
   adversarial stance, the repository agent-instructions path and the plan
   path, the [BLOCKER]/[RISK]/[NIT] report format, and "a clean verdict is
   a valid and expected result."
2. Adjudicate exactly as in Phase A/B: apply accepted edits to the plan
   file; record rejections with one-line reasons. Behavior or scope
   changes still go to the user.
3. No blockers found → converged. Blockers found → apply the fixes, then
   dispatch exactly one more reviewer to verify them (R2 lens, fixes are
   prime suspects). Hard cap: 2 rounds — blockers still open after round 2
   go to the user.
4. Audit Log final line: `CONVERGED (light audit, round N clean)` or
   `CAPPED (light audit — blockers remain)`.

A plan whose routing header claims the repository agent instructions'
simplicity exemption skips this skill entirely — the implementation
workflow appends its `SKIPPED — simplicity exemption` Audit Log line
itself and no critic or reviewer is dispatched. A direct user request to
audit such a plan still runs the light audit.

A user order overrides the sizing in either direction for a specific plan.

## Phase A — Improve ("can the plan be better?") — iterate until solid

1. Dispatch 1–2 fresh, read-only critic agents. Their lens: "Is there a
   materially simpler or safer plan that fully solves the same request?
   Judge against the repository's design priorities. Every suggestion must
   name the concrete alternative, what it removes or de-risks, and its
   cost. Improvement means LESS machinery or LESS risk for the same
   outcome — never propose additions, new abstractions, or scope growth.
   If the plan is already the right design, SAY SO — 'this plan is solid'
   is a valid and expected verdict."
2. Adjudicate: fold accepted improvements into the plan file; reject the
   rest with one-line reasons recorded in the file. Any change affecting
   behavior or scope goes to the user before proceeding.
3. **Adaptive rounds:** run another round only if the previous round
   produced accepted MATERIAL improvements (design or step changes —
   wording polish does not count; when unsure whether an accepted change
   is material, treat it as material). Each new round uses fresh critics
   who receive the prior rounds' adjudication log with this rule:
   "previously adjudicated suggestions are settled — do not re-propose or
   reverse them without new evidence" (prevents round-to-round ping-pong).
   Stop the moment a round returns no accepted material improvements —
   that round's "solid" verdict is Phase A's exit. Hard cap: 4 rounds; if
   round 4 still produced material changes, tell the user the design
   hasn't stabilized and let them decide.
4. On exit the design is FROZEN — Phase B treats every documented decision
   as final.

## Phase B — Verify (loop to convergence)

1. Dispatch fresh, read-only reviewer agents: one for plans of 1–2 waves,
   up to three (split by wave ranges) for larger programs.
2. Every reviewer prompt must contain: the repository agent-instructions
   path and the plan path; the adversarial stance ("try to refute;
   re-derive every claim from source; do not trust the plan's citations");
   "documented decisions are final — hunt errors, do not re-litigate";
   this round's lens; and the report format — [BLOCKER]/[RISK]/[NIT] with
   file:line evidence, per-wave verdict READY or NEEDS EDITS with exact
   edits, and "a clean verdict is a valid result."
3. Apply every accepted edit to the plan file before the next round;
   record rejected findings with a one-line reason.
4. **Rounds 1 and 2 are mandatory — round 2 runs even when round 1 is
   clean** (it then drops the verify-fixes lens and runs clean-slate
   only). Afterward, continue only while a round reports blockers; risks
   and nits fold in without another round — only blockers extend the loop.
   Hard cap: 4 rounds — if the fourth still finds blockers, stop and
   surface them to the user.

Lenses by round:
- **R1** — fact-check every file:line claim + implementer walk (execute
  each step mentally; flag anything that would not compile, would not
  typecheck, or forces a guess).
- **R2** — verify the previous round's fixes against source (fixes are
  prime suspects) + clean-slate re-read WITH runtime simulation: execution
  order, async and transaction boundaries, concurrency, partial states,
  and code the test gate cannot execute (mandatory-coverage: every audited
  plan receives runtime simulation).
- **R3** — whole-document coherence (patch-introduced contradictions).
- **R4** — clean-slate re-derivation of everything, as if no audit happened.

Single-reviewer rounds combine that round's lenses into one prompt.

## Audit Log and handoff

Append `## Audit Log` to the plan file: Phase A — per round, suggestions
accepted/rejected; Phase B — per round: reviewer count, blockers/risks/nits,
fixed vs. rejected; final line `CONVERGED (round N clean)` or `CAPPED
(blockers remain — listed above)` or `CAPPED — user approved proceeding`.
Report the same summary to the user, name residual risks the
implementation gates must own, and hand off the audited plan file path.
Implementation must not start from a normal-workflow plan whose file
lacks this log.
