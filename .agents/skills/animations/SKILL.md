---
name: animations
description: Design, tune, or review motion in this project — animations,
  transitions, entrances, cascades, celebrations, haptics, reduced-motion
  behavior — against its motion taste. Use when adding or changing an
  animation, choosing a duration, curve, delay, or stagger, choreographing
  a screen's entrance, adding a celebration or haptic, or when motion feels
  wrong (rushed, bouncy, jumpy, replaying on open). Not for static styling,
  layout, or color work, and not for editing the motion spec on its own.
  Supplies the spec; the repository's implementation workflow still
  writes the code.
---

# Animations

Before adding any animation, check the repository's motion spec (`MOTION.md`
if it exists) for a Graveyard section — killed animations stay dead. This
skill supplies the motion spec and the taste bar; the repository's agent
instructions decide who writes the code and how it is verified.

## Curves

- Arrivals ease out. A **clock-driven** value gliding between two
  on-screen states eases in-out; a **user-driven** change still eases
  out. Linear is only for functional fills (progress bars, hold sweeps,
  playback) and zero-duration instant resets. Symmetric opacity
  crossfades may ease in-out.
- Springs are punctuation, not grammar: pops, one signature lift, and
  settles after a direct manipulation. If you cannot name what the
  overshoot celebrates or lands, ease out instead.
- Continuous indicators derive their phase from the wall clock, never
  from component state plus an infinite repeat, so a re-render can never
  restart them. Under reduced motion they stop moving — a static form,
  or gone. Out-and-back accents are finite: they end on the value they
  started from and stop.

## Timing

- Narrative blocks cascade with a gap of ⅓–½ of the entrance duration,
  applied as the block's outermost animation so its children inherit it.
- Micro-cascades inside one block stay fast: one stagger token per
  surface, or a fixed span divided by item count when the count varies.
  Never the narrative beat.
- The payoff waits for the punch: a dependent reveal keys on the moment
  it answers, never on a fixed delay that can race it. A signature
  animation starts only after its own container is visibly present.
- Route and tab switches are near-cuts. Opening a screen never replays
  history or animates live values into place — live updates gate behind
  a quiet window after mount and key on the coarsest meaningful
  granularity, never a per-second clock.

## Rules

- Layout stability is inviolable: nothing outside the animating element
  may shift, reflow, or wrap. Reserve final width before animating
  (constant digit counts plus tabular figures for numeric rolls).
- A celebration overlay is unique: one app-wide.
- Haptics carry meaning or they are noise: open, select, committed
  success, committed warning, failure. A haptic may punctuate one motion
  beat that lands — never sprinkled through an animation — and reduced
  motion skips it, because a tick with nothing behind it is a tick from
  nowhere. Platforms without haptics simply omit them.
- Reduced motion: settled on frame one — no animation object and a
  static branch in the render path, not a shortened duration. Honor the
  platform's own setting (`prefers-reduced-motion` on web and Electron,
  the OS accessibility flag on mobile). Fades and functional fills may
  remain.
- Meaningful destructive or irreversible commits get a press-and-hold
  whose fill and completion clock read one duration constant, with a
  direct accessible activation path that skips the hold.
- Every **new** duration lives once — a token in the project's design
  token package, with a doc comment listing its riders. Share a token
  only when every rider should retune together; otherwise give the
  surface its own token and say why. Pre-existing inline literals stay
  unless the task is theirs.

## Workflow

1. Check the token package and the motion spec's screen and token
   entries for an existing answer before inventing values.
2. Implement using the framework's own animation primitives. If this
   skill directory has a `references/mechanics.md` for the project's UI
   framework, read it before writing any animation code.
3. Prove timing by measurement: screen-record, verify starts
   frame-by-frame, and confirm that no pixel outside the animating
   element changes.
4. Update the motion spec in its existing shape: a screen entry, tokens
   under its token section, cuts under Graveyard (permanent), and claim
   the signature section only for the product's one signature moment.
