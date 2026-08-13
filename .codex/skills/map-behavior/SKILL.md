---
name: map-behavior
description: Trace and document how an existing software system behaves from entry points through state, data, side effects, outputs, and failures. Use when asked to map application behavior, explain a flow across a codebase, document current behavior before a refactor, or compare documented intent with tests and implementation. Report discrepancies without fixing them, and write an artifact only when requested.
---

# Map Behavior

Describe behavior from evidence, not filenames or memory. Remain read-only
unless the user explicitly requests a documentation artifact.

## Establish authority and scope

Read any available repository instructions and the authoritative product or technical
documents relevant to the requested flow. Identify the entry points and every
consumer that can observe the behavior. Expand scope only far enough to trace
the complete flow.

## Trace the flow

For each behavior, record:

- trigger or input;
- validation and decision points;
- state owner and lifecycle;
- reads, writes, persistence, and external calls;
- output or user-visible result;
- failure, retry, cancellation, and concurrency behavior;
- tests that enforce the behavior.

Separate four evidence categories: documented intent, behavior required by
tests, behavior implemented by code, and behavior observed from available
runtime evidence. Do not infer intent from a symbol name when stronger authority
exists.

## Handle discrepancies

Describe each mismatch with its evidence, trigger, and impact. Label uncertainty
plainly. Do not fix suspected bugs, rewrite tests, or turn discoveries into an
implementation backlog unless the user separately requests that work.

## Deliver

Return the map in conversation by default. If the user requests a file, follow
the repository's documentation conventions or the supplied destination. State
the inspected scope, evidence gaps, and any behavior that could not be verified.
