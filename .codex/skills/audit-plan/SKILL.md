---
name: audit-plan
description: Verify an existing implementation plan against the repository and the user's requirements. Use when asked to audit, review, stress-test, fact-check, or assess the readiness of a plan before implementation. Report evidence-backed corrections and risks; remain read-only unless the user explicitly requests edits to the plan.
---

# Audit Plan

Treat the plan as a claim to verify, not as evidence. Do not modify production
code or begin implementation.

## Establish the audit target

Read the complete plan, user requirements, any available repository instructions, relevant
authority documents, implementation, tests, configuration, and migrations.
Identify the exact plan version and repository state being audited.

## Verify the plan

Check that:

- every requirement maps to a concrete step and observable verification;
- file, symbol, behavior, dependency, and command claims match the repository;
- the design follows established architecture and does not silently expand scope;
- state ownership, data changes, failures, concurrency, security, and rollout
  are addressed where relevant;
- steps are ordered by real dependencies and leave the repository verifiable;
- unresolved product or architecture decisions are explicit;
- tests cover the important behavior rather than only the happy path.

Mentally walk an implementer through each step. Flag any place that would force
guessing or could produce a partially migrated state.

## Report

List findings before commentary:

- `BLOCKER` — implementation should not start;
- `RISK` — plan can proceed only with an explicit mitigation or accepted risk;
- `NIT` — useful precision that does not affect readiness.

For each finding, provide the claim, repository evidence, impact, and exact plan
change required. If no actionable findings remain, say the plan is ready and
name any verification that must occur during implementation.

Edit the plan only when the user explicitly asks, then rerun the same checks on
the resulting document.
