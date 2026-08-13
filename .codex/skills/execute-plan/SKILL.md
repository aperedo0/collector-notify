---
name: execute-plan
description: Execute an existing approved implementation plan in bounded, verifiable stages. Use when the user asks to implement, continue, or complete work from a named plan or repository milestone. Do not create a replacement plan, bypass approval or stop gates, or continue beyond the authorized stage.
---

# Execute Plan

Treat the approved plan and repository authority as the implementation contract.
Do not redesign the work while executing it.

## Resolve the next stage

Read the complete plan, any available repository instructions, relevant authority documents,
current implementation, tests, and working-tree state. Identify the next
authorized incomplete stage and its acceptance criteria. Do not repeat completed
work.

Before editing, list the expected files, checks, assumptions, and unresolved
conflicts required by the repository. Stop when a higher-authority conflict,
missing product decision, or unavailable prerequisite prevents safe execution.

## Implement the stage

Make only changes authorized by the selected stage. Preserve unrelated work and
follow the plan's architecture, dependency, data, security, and compatibility
constraints. Resolve ordinary implementation details from existing patterns;
do not turn them into a new architecture or second plan.

Keep the repository verifiable throughout the stage. If required scope changes,
record the deviation and obtain approval when it affects behavior, data,
architecture, dependencies, or later stages.

## Verify and hand off

Run the stage-specific checks and the repository-required gate. Inspect the
result against every acceptance criterion and report actual outcomes, files
changed, deviations, blockers, and remaining work.

Honor the repository's completion boundary. If it requires stopping after a
milestone or unit, stop and wait for explicit authorization before continuing.
Do not stage, commit, publish, or begin the next stage unless requested.
