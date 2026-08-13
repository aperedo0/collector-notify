---
name: refactor
description: Improve a bounded area of existing code without changing its intended observable behavior. Use when asked to refactor, simplify, reorganize, rename, extract, or reduce coupling in existing implementation. Do not use for new features, intentional behavior changes, bug fixes disguised as cleanup, or broad rewrites.
---

# Refactor

Choose one bounded target and preserve its observable contract. Follow the
repository's available instructions, architecture, language conventions, and Git rules.

## Establish the contract

Read the target, callers, tests, authoritative behavior documentation, data
formats, side effects, and other build targets that consume it. Record the
behavior that must remain unchanged and the concrete quality problem being
solved.

Run the relevant baseline checks when available. If coverage cannot distinguish
preserved behavior from an accidental change, add focused characterization tests
when the repository permits it. Stop when intended behavior is genuinely
ambiguous.

## Refactor incrementally

Plan small steps that each leave the target coherent and verifiable. Prefer
clear names, explicit ownership, cohesive units, shallow control flow, and
existing patterns. Add an abstraction only when it removes demonstrated
duplication or coupling.

After each meaningful step, run the narrowest useful check. Keep adjacent bugs,
formatting churn, dependency changes, and unrelated cleanup outside the target.
Do not weaken tests or silently correct known behavioral differences.

Preserve unrelated working-tree changes. Do not stage, commit, branch, or
rewrite history unless the user explicitly requests that Git action.

## Finish

Run the repository-required gate and any target-specific checks. Review the
final diff for behavior changes, scope creep, stale references, and accidental
public API or persisted-data changes. Report what became simpler, the preserved
contract, files changed, checks and actual results, and any remaining risks.
