---
name: design-motion
description: Design, implement, tune, or review motion in a user interface, including transitions, entrances, feedback, loading indicators, celebrations, and reduced-motion behavior. Use when UI animation is being added or changed, timing or easing feels wrong, motion replays unexpectedly, or animated layout becomes unstable. Do not use for static styling alone.
---

# Design Motion

Make motion explain a state change, preserve spatial continuity, or confirm an
interaction. Remove motion that has no clear purpose.

## Discover the local system

Read any available repository instructions and inspect the UI framework, design tokens,
existing motion patterns, accessibility settings, and relevant tests. Reuse a
healthy existing convention before introducing a new one.

## Specify the motion

For each animated element, define:

- the user or system event that starts it;
- start and settled states;
- duration, easing, delay, and interruption behavior;
- whether it may repeat and what stops it;
- the reduced-motion result;
- the observable check that proves it behaves correctly.

Use restrained easing for ordinary state changes. Reserve overshoot and
celebratory motion for moments that warrant emphasis. Derive continuous motion
from stable time or state so rerenders do not restart it unexpectedly.

## Protect usability

- Keep surrounding layout stable; reserve final space before animating values
  whose size can change.
- Keep controls usable while motion is interrupted or disabled.
- Provide a settled first frame when reduced motion is enabled. Preserve only
  functional progress or subtle fades when appropriate.
- Avoid stacking unrelated movements, feedback, and sound on one event.
- Centralize a timing value only when all consumers should be tuned together.

## Verify

Use the project's available test, preview, recording, or inspection tools.
Check first render, replay, interruption, rapid input, navigation away and
back, reduced motion, slow devices, and content at minimum and maximum size.
Confirm that pixels outside the intended region do not move unexpectedly.
