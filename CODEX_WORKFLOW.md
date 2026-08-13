# Codex Workflow for Notify

This file is operational convenience only. It does not override the canonical
authority order in `PLAN.md` Section 0.1.

## 1. First prompt: read-only preflight

Use this after copying the specification, screenshots, and skills into the repo:

```text
Read the repository specification before modifying anything:

- PLAN.md
- PRODUCT_SPEC.md
- AGENTS.md
- docs/UI_HANDOFF.md
- docs/MOCKUP_INDEX.md
- docs/mockups/manifest.json
- docs/assets/README.md
- docs/COMPETITOR_RESEARCH.md

Inspect the full-size screenshot boards under:
- docs/mockups/desktop
- docs/mockups/mobile

Do not modify any files.

This is a read-only executable preflight.

Report only:
1. contradictions between PLAN.md, PRODUCT_SPEC.md, AGENTS.md, and docs/UI_HANDOFF.md;
2. missing files/assets;
3. missing decisions that would block M0, M1, or M2;
4. human-owned prerequisites needed before M0–M2;
5. whether M0 is executable as written.

Do not create a replacement architecture.
Do not rewrite PLAN.md.
Do not begin M0.
```

## 2. Start M0

After the preflight is clean:

```text
Execute M0 only.

Read PLAN.md and AGENTS.md again before beginning.
Follow PLAN.md Section 14.0 exactly.

Produce the PRE-WORK M0 report before modifying files.

Implement only M0.
Run every M0-required validation.
Produce the exact MILESTONE COMPLETION REPORT from PLAN.md.

Then STOP.
Do not begin M1.
```

## 3. Subsequent milestones

Use:

```text
Execute M<N> only.

Read PLAN.md Section 14.0 and the M<N> milestone again before beginning.
Stay inside the allowed paths.
Produce the PRE-WORK report before modifying files.
Run all required validation.
Produce the MILESTONE COMPLETION REPORT.
Then STOP.
```

## 4. UI milestone addition

For M3 and later UI milestones, append:

```text
For every screen in this milestone:

1. Read the screen behavior in PRODUCT_SPEC.md.
2. Read its PLAN.md requirements.
3. Read the matching board notes in docs/UI_HANDOFF.md.
4. Open the corresponding full-size desktop/mobile board.
5. Explicitly list any screenshot-only artifacts that UI_HANDOFF says to ignore.
6. Implement every required state.
7. Compare the running implementation to the screenshot for layout/hierarchy/spacing.
8. Do not introduce behavior from the screenshot that `PLAN.md` or `PRODUCT_SPEC.md` excludes.
```

## 5. Review/commit rhythm

Recommended human workflow:

```text
M0 → review → commit
M1 → review → commit
M1.5 → review → commit
M2 → review → commit
M2.5 → review report
M3 → review → commit
...
```

Do not authorize the next milestone until the previous completion report and behavior are reviewed.
