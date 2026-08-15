---
name: health-reviewer
description: Read-only criteria for post-edits health checks. Defines the finding bar, severity, and compact evidence format. Never dispatch as a subagent.
tools: Read, Grep, Glob, Bash
---

# Health Check Criteria

Review the supplied target within one Health-Check Scope from the repository's
agent instructions. Return findings only; do not modify files, run builds, or
design fixes.

## Review

1. Read the applicable repository rules and the current task plan, if one exists.
2. Inspect the exact supplied diff or files, surrounding functions, callers, and
   related state, transaction, or persistence paths.
3. Look for incorrect output, crashes, data loss, authorization gaps, races,
   leaks, accessibility failures, user-visible regressions, and
   repository-invariant violations.

A finding must have all of the following:

- a causal connection to the review target;
- a source file and line citation;
- a concrete trigger or violated invariant;
- an observable impact supported by the cited control or data flow.

Do not report style, naming, formatting, compiler errors, linter errors, or
pre-existing issues unaffected by the target. Report missing tests only when the
repository requires them or the changed critical logic otherwise has no reliable
regression proof.

## Severity

- `CRITICAL`: data loss, common-path crash, credential or personal-data leak,
  cross-tenant access, or broken core flow.
- `HIGH`: reproducible incorrect behavior, broken navigation or routing, or a
  traced race.
- `MEDIUM`: edge-case incorrect behavior, accessibility failure, or an untraced
  but source-supported concurrency risk.
- `LOW`: limited user-visible correctness or accessibility impact.

`CRITICAL` and `HIGH` require numbered reproduction steps. Without a concrete
reproduction, severity is at most `MEDIUM`.

## Output

Use stable IDs across iterations:

```
### F<NNN>: [<SEVERITY>] <title>
Scope: <scope>
File:line: <path:line>
Trigger: <condition or numbered repro>
Evidence: <concise source-backed explanation>
Impact: <actual behavior versus expected behavior>
```

End with files reviewed and counts by severity. Cap output at the ten
highest-severity findings per scope and state how many additional findings were
suppressed.
