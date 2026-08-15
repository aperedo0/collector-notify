---
name: plan-code
description: Design an implementation-ready plan before any code is written. Use when asked to plan, design, architect, or scope a code change, or when an implementation workflow needs a plan. Presents the plan in conversation; never modifies code and never writes files unless explicitly asked.
---

# Plan Code

Design the smallest plan that fully solves the request — clear enough that
a junior developer could implement it without guessing.

## Read before designing

1. Read the repository's agent instructions (`AGENTS.md` / `CLAUDE.md`) and any authority documents they name. They override this skill.
2. Read the code to be changed, plus its callers, tests, and configuration.
3. Trace the real flow: entry point → data flow → state ownership → persistence. Never plan from filenames or isolated snippets.
4. Answer your own questions from the repository. Ask the user only when an open choice would materially change behavior, data, or architecture — and state a recommendation.

## Design priorities

Correctness and repository invariants come first, always. Then, in order:

1. **Readability** — a junior developer with zero context understands the code from its names, structure, and control flow.
2. **Maintainability** — one job per module, explicit state ownership, minimal coupling, existing conventions reused.
3. **Testability** — critical logic lives outside UI, transport, and platform frameworks.
4. **Scalability** — handles credible growth without speculative abstraction.
5. **Performance** — no repeated work, blocking I/O, or unnecessary work on hot paths.

Buzzwords must earn their place:

| Claim | Required proof |
|---|---|
| "Scalable" | A named, credible growth dimension |
| "Fast" | A named hot path and how it will be measured |
| "Maintainable" | Ownership and coupling shown in the design |
| "Best practice" | It matches this repository's conventions and platform |

Every new abstraction, interface, cache, or layer must solve a problem that
exists today. Prefer extending a healthy existing pattern.

## The plan

Cover, in plain language — omitting any section that does not apply rather than leaving it empty:

- **Routing** — when the repository's agent instructions define a routing or audit-sizing scheme, open the plan by naming the assigned route and proposed audit depth. When claiming an exemption the scheme offers, list each of its criteria with a one-line proof it holds — approval of the plan then ratifies that sizing.
- **Authority check** — when the repository names an authoritative plan or spec, cite the sections that govern this work, and state whether the change stays inside them. Anything outside them is an Open decision, never a silent choice.
- **Goal** — one paragraph, plus observable success criteria.
- **Current behavior** — how the relevant code works now, with file and symbol references.
- **Design** — what changes, who owns which state, why this is the smallest suitable approach, and — when a materially different approach exists — the strongest rejected alternative with the concrete reason.
- **Blast radius** — everything outside the edited files that can observe
  the change; list each consumer by name, not by category:
  - code: every caller, route, or view that uses a changed symbol;
  - every other package, target, or process that builds or loads a changed file;
  - persisted data whose format or meaning the change touches, including
    records earlier versions already wrote, and any migration ledger;
  - published contracts: API schemas, generated clients, event payloads.
  Give each consumer a disposition: deliberately changed (name the step)
  or must not change (name the test that would fail if it did — or a smoke
  check when no test reaches that surface). A deliberate change the
  request did not ask for is an Open decision, not a footnote. A change
  with no outside consumers states that in one line rather than omitting
  the section.
- **Steps** — ordered; each names its files and symbols, what changes, and the test or check that proves it done. No vague steps ("update the logic").
- **Waves** — group steps into waves only when later steps depend on earlier ones AND each wave can be built, tested, and reviewed on its own. One wave is the default; never split by layer or file count alone. Write each wave as self-contained instructions addressed to the engineer who will implement it — an engineer with zero access to this conversation. Each wave names its exact files and symbols, its verification — naming the repository's documented build-and-test gate by reference, spelling out only wave-specific checks — and a tie-breaker for anything that could reasonably go two ways ("if X is ambiguous, prefer Y").
- **UI spec** — for UI work, record the absolute file path of each mock image and transcribe the mock into a written spec: spacing, sizes, hierarchy, and colors mapped to existing design-system tokens. If HTML/CSS accompanies the mock, extract exact values from the markup instead of estimating them from pixels. Spec priority for implementers: explicit user instructions first, then the mock image for anything visible (appearance, geometry), then this transcription for what the image cannot show (behavior, token mapping). A token mapping holds only when it preserves the mock's visual result.
- **Edge cases** — walk the changed flow through each lens below and write
  the concrete cases, not the category names:
  - inputs and collections at empty, one, and maximum; numeric boundaries
    just-below, at, and just-above;
  - failure paths: I/O and network errors, missing or partial data, denied
    or revoked permissions, rejected writes;
  - timing: concurrent access, re-entry, duplicate or late callbacks,
    retries, and midnight/DST/timezone boundaries in any date math;
  - documented limits of the frameworks, databases, and services involved.
  Give each case a disposition: the step and check that handle it, or one
  line accepting it with the reason. A change with none states that in one
  line rather than omitting the section. Presentation-only changes still
  cover empty, longest, and overflowing content.
- **Open decisions** — only choices the user must make, each with a recommendation. Resolve every one with the user before the plan is final: an approved plan contains zero open decisions, because the engineers implementing it cannot ask you anything.

## Validate, present, stop

Check: every requirement maps to a step and a verification, and every
behavior change traces back to a requirement or a resolved open decision;
every edge case and blast-radius consumer has a disposition; state
ownership is unambiguous; no unrelated cleanup crept in. Then run the
handoff lint:
could a competent engineer with zero access to this conversation implement
every wave without asking a single question? If not, the plan is not done —
fix it before presenting. Then:

- **Standalone request** (the user asked for a plan): present the plan in conversation and stop. Write it to a file only if the user asks.
- **Invoked by an implementation workflow** (e.g. wave-manager): return the plan to that workflow and let its own approval and plan-file rules take over. Do not create a second plan or a second file format.
- In both modes: never modify production code.
