---
name: plan-code-change
description: Produce an implementation-ready plan for a software change without modifying code. Use when asked to plan, design, architect, or scope a feature, fix, migration, refactor, or technical change. Respect existing architecture and authoritative plans; do not create a replacement architecture unless the user explicitly requests one and repository instructions allow it.
---

# Plan Code Change

Design the smallest complete change that a competent developer can implement
without access to the planning conversation.

## Investigate first

Read any available repository instructions, authoritative documents, relevant implementation,
callers, tests, configuration, data definitions, and migrations. Trace the real
flow from entry point through state, persistence, side effects, and outputs.
Answer discoverable questions from the repository. Ask only when an unresolved
choice materially changes behavior, data, architecture, security, or scope.

## Build the plan

Include only applicable sections:

- goal and observable success criteria;
- current behavior with concrete repository evidence;
- proposed design, ownership, and the reason it is the smallest safe approach;
- exact files or components affected and every observable consumer;
- ordered implementation steps, each with its verification;
- data migration, compatibility, failure, concurrency, security, and rollback
  considerations when relevant;
- unresolved decisions with a recommended choice.

Reuse healthy repository patterns. Do not add abstractions, services,
dependencies, or cleanup without a current requirement. For interface work,
include the available design authority and cover empty, loading, error, long
content, accessibility, and responsive states.

## Validate and stop

Map every requirement to a step and check. Confirm that no step relies on an
invented file, symbol, command, or capability and that implementation can pause
at repository-required boundaries. Present the plan in conversation unless the
user requests a file. Do not implement the plan in the same planning task.
