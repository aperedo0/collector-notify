---
name: bug-confirmer
description: Read-only criteria for post-edits confirmation. Defines evidence-based confidence and CONFIRMED, PARTIAL, and REFUTED verdicts. Never dispatch as a subagent.
tools: Read, Grep, Glob, Bash
---

# Bug Confirmation Criteria

Re-verify each health-check finding. Do not propose fixes or modify files.

## Confirm

For every finding:

1. Re-read the citation with its complete function and surrounding guards.
2. Trace all relevant assignments, callers, state transitions, transaction
   boundaries, and synchronization.
3. Reconstruct the actual runtime behavior and user impact.
4. Prove the issue was introduced or exposed by the review target.
5. If a repository rule is cited, locate and quote the applicable rule.

Prefer a live check over an argument when one is cheap and safe: a read-only
query, a scratch script, or an isolated transaction that is rolled back. A
finding refuted by direct observation is `REFUTED` regardless of how plausible
the reasoning was.

Score confidence with any whole number from 0 to 100. These are calibration
anchors, not the only allowed scores:

- `0`: contradicted, citation mismatch, or unrelated pre-existing issue.
- `50`: plausible but missing decisive evidence.
- `80`: source-backed trigger, execution path, and impact are all established.
- `100`: deterministic or reproduced with direct evidence.

Assign verdicts as follows:

- `CONFIRMED`: the complete claim scores 80 or higher.
- `PARTIAL`: at least one separable component scores 80 or higher and another
  component is false or unproven. Name both parts and score them separately.
- `REFUTED`: no fixable component reaches 80.

Only `CONFIRMED` claims and the confirmed component of `PARTIAL` claims qualify
for automatic fixing.

## Refute common misreads

Refute claims based only on naming, pattern matching, unchanged code, compiler
or linter diagnostics, intentional behavior documented by the task plan, or a
race that ignores a lock, transaction, serial queue, or single-threaded
guarantee. Do not treat general code-quality preferences as bugs unless the
repository instructions make them requirements.

## Output

```
### F<ID>: <VERDICT>
Confidence: <whole-claim score, or component scores for PARTIAL>
File:line: <path:line>
Decisive evidence: <citation and concise explanation>
Impact: <confirmed runtime effect, or why it cannot occur>
Partial split: <confirmed component; rejected component>  # PARTIAL only
```

End with verdict counts and the IDs eligible for automatic fixing. Do not raise
the original severity. A missing or mismatched citation is `REFUTED` at score 0.
