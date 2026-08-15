# Notify — Codex Agent Instructions

This repository already has an implementation plan. Do not redesign the product or create a replacement architecture.

## 1. Authority order

Read these before implementation:

1. `PLAN.md` — highest implementation authority.
2. `PRODUCT_SPEC.md` — canonical customer-facing product/UX behavior; `PLAN.md` overrides it.
3. `docs/UI_HANDOFF.md` — tells you how to interpret screenshots; visual authority only.
4. Existing automated tests.
5. This `AGENTS.md`.
6. Existing implementation.

`docs/COMPETITOR_RESEARCH.md` is background only. It has no implementation authority.

Skills may assist execution but never override the authority order above.

If two authoritative sources genuinely conflict and `PLAN.md` does not resolve the conflict, STOP and report it. Never resolve a conflict silently.

## 2. Do not re-plan the application

`PLAN.md` is the implementation plan.

Do not:
- replace the architecture;
- generate a new whole-project plan;
- introduce services, dependencies, routes, tables, screens, or product behaviors not authorized by `PLAN.md`;
- reinterpret competitor research as product requirements.

A read-only preflight is allowed when explicitly requested.

## 3. Work one milestone at a time

Follow `PLAN.md` Section 14.0 exactly.

Before changing files for a milestone:
- produce the required PRE-WORK report;
- list expected files/dirs;
- list acceptance criteria;
- report contradictions/missing decisions.

If a blocker exists, STOP.

After the milestone:
- run the required checks;
- produce the required MILESTONE COMPLETION REPORT;
- STOP;
- do not begin the next milestone until the human explicitly authorizes it.

## 4. Non-negotiable implementation rules

- Money is integer cents everywhere.
- Customer UI uses `packages/data` and never imports Drizzle, a PostgreSQL driver, or server-only `packages/db` code.
- User-facing strings come from `packages/config/strings.ts`.
- Routes come from `packages/config/routes.ts`.
- Static limits/intervals come from the configuration modules named in `PLAN.md`.
- Database changes are numbered migrations only.
- Database credentials exist only in `apps/api`, `apps/monitor`, and migration jobs, using the separate roles required by `PLAN.md`.
- Proxy credentials exist only in `apps/monitor`; never expose them to desktop/mobile/shared packages or logs.
- Do not add dependencies unless `PLAN.md` names them or the human approves them.
- Do not implement a real retailer source before M9 and explicit human approval.
- V1 monitor deployment is a single replica unless `PLAN.md` is explicitly changed.

## 5. Architecture boundary

There are four runtime products/services:

1. `apps/api`
   - customer-facing Fastify REST/WebSocket backend
   - owns Better Auth and verifies every customer session
   - is the tenant authorization boundary
   - is the only customer-facing service that accesses PostgreSQL
   - never owns retailer/proxy infrastructure

2. `apps/monitor`
   - internal/developer-operated
   - centrally checks canonical products
   - owns retailer/feed adapters
   - owns proxy infrastructure if `TargetOfferSource` is used
   - matches observations against customer alerts
   - creates Recent events
   - dispatches mobile push

3. `apps/desktop`
   - customer-facing Electron app
   - never performs retailer monitoring
   - never receives proxy credentials/configuration

4. `apps/mobile`
   - customer-facing Expo app
   - never performs retailer monitoring
   - never receives proxy credentials/configuration

Never expose monitor/proxy/operator UI in either customer app.

## 6. Screenshot usage — mandatory procedure

The screenshot sets use descriptive filenames under:

- `docs/mockups/desktop/`
- `docs/mockups/mobile/`

The canonical filename inventory and screen mapping are defined in
`docs/MOCKUP_INDEX.md` and `docs/mockups/manifest.json`.

Before implementing a UI screen:

1. Read the relevant `PLAN.md` section.
2. Read the relevant `PRODUCT_SPEC.md` section.
3. Read the matching board entry in `docs/UI_HANDOFF.md`.
4. Open the corresponding **full-size** board image.
5. Identify every relevant state shown on the board.
6. Implement behavior from `PLAN.md` and `PRODUCT_SPEC.md`.
7. Use the screenshot for layout, spacing, hierarchy, proportions, typography treatment, and component styling.
8. Apply every documented screenshot override from `docs/UI_HANDOFF.md`.
9. If an apparent screenshot conflict is not already documented, STOP and report it.
10. Do not implement a screenshot-only feature merely because it is visible.

Screenshots are never behavioral authority.

## 7. Visual direction

Notify is blue-first.

Preferred:
- royal/cobalt primary blue;
- deep navy/charcoal navigation;
- white/light content surfaces;
- neutral grays;
- red only for destructive/error;
- amber only for warning;
- restrained blue/neutral success treatment.

Do not make bright purple or bright green the dominant product branding.

Legacy screenshots may say `Poké Watch`; the product/repo name is `Notify`.

## 8. Customer navigation

Exactly five customer-facing roots:

`Home · Browse · Alerts · Recent · Account`

Desktop:
- persistent left sidebar;
- all five labels visible.

Mobile:
- bottom tabs;
- same five roots.

Never rename the root `Alerts` to `My Alerts`.

## 9. Security

API:
- desktop/mobile never connect to PostgreSQL;
- derive `user_id` only from the verified Better Auth session;
- scope every user-owned query by that ID;
- validate and serialize every `/v1` route with the shared Zod contract;
- keep database credentials, cookies, realtime tickets, and internal errors out of clients and logs;
- use the separate database roles and pooled/direct connections required by PLAN.

Electron renderer:
- no Node APIs;
- no filesystem;
- no direct Electron imports;
- no secrets;
- no auth cookies or session tokens;
- no raw IPC.

Preload:
- only typed methods authorized by PLAN;
- never expose generic `ipcRenderer`.

Main:
- validate preload/deep-link payloads;
- validate external URLs;
- deny unexpected windows/navigation;
- keep `webSecurity` enabled.

Retailer/proxy behavior must follow PLAN's failure taxonomy. Proxy failover is for transport/proxy failure, not for bypassing retailer throttling, challenges, queues, or access controls.

## 10. Verification

Before claiming a milestone complete:
- run every command required by PLAN;
- run `pnpm lint`;
- run `pnpm typecheck`;
- run `pnpm test`;
- run milestone-specific database-role/API-authorization/realtime/UI checks;
- report actual results.

Never claim “everything works” without evidence.

**The documented build-and-test gate**, referenced by every skill and agent below, is exactly: `pnpm lint`, then `pnpm typecheck`, then `pnpm test`, run sequentially in that order. Database work adds `pnpm db:reset` followed by `pnpm db:check`. Proof means the verbatim output of each command, never a summary.

## 11. Workflow routing

Everything in this section is execution machinery. It sits at rank 5 of Section 1's authority order and never overrides `PLAN.md` — in particular Section 14.0's one-milestone-at-a-time protocol, the per-milestone allowed paths, and every STOP rule in Section 0.2. Where a skill and `PLAN.md` disagree, `PLAN.md` wins and the conflict is reported.

Composition inside a milestone: `PLAN.md` §14.0 PRE-WORK report → `plan-code` → `plan-audit` → `wave-manager` waves → `PLAN.md` §14.0 MILESTONE COMPLETION REPORT → STOP.

### Protected areas

The single definition every rule below references:

- `packages/db/migrations/**` — the immutable ledger — and `packages/db/docker/init/**`;
- any database role, grant, privilege, `SECURITY DEFINER` function, or trigger;
- Better Auth configuration, session verification, and anything deriving `user_id`;
- realtime ticket issue/consume paths;
- proxy credentials and their encryption;
- Electron security flags, the preload surface, and deep-link validation;
- environment variables, dependencies, and root tooling (`turbo.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`).

### Routing ladder

Classify every request against this ladder top to bottom; first match wins. The final diff decides the bucket, not the intent — a diff exceeding its bucket promotes the task to the next heavier bucket, with the promotion mechanics the skills define.

1. **Not a pipeline job** — questions, diagnostics, read-only audits, visual checks (see below).
2. **Trivial self-service** — one unambiguous literal replacement, no protected areas.
3. **Light lanes** — small task (one file) or presentation-only restyle; defined in `wave-manager`.
4. **Normal — Standard** — a single wave confined to view-layer feature files plus additive design-system tokens; no protected areas, no schema, no API contract, no navigation-architecture changes. Full `wave-manager` workflow with `plan-audit`'s LIGHT audit (one combined round).
5. **Normal — Full** — everything else: multi-wave programs, or anything touching a protected area. Full `wave-manager` workflow with the full `plan-audit` pipeline.

The **simplicity exemption** can reduce a bucket-4 or bucket-5 plan's audit to a recorded skip. It never changes the bucket's approval gate, workflow, or review requirements — only the audit depth. A normal-workflow plan skips `plan-audit` entirely, and the user's plan approval doubles as the dispatch trigger, when ALL of these hold: (1) single wave; (2) additive and self-contained — new files, packages, or wiring, with existing behavior unchanged and proven by the unchanged gate; (3) worst-case failure is loud or local — a failing gate or the new code itself misbehaving — never a silent change to existing data or authorization; (4) no protected area touched; (5) the plan's routing header claims the exemption with one line of proof per criterion. Any criterion uncertain → the exemption does not apply.

### Skill dispatch

Every entry below names its fallback path for agents without a skill loader. Canonical skills live in `.agents/skills/<name>/SKILL.md`, exposed to Claude Code at `.claude/skills/` and to Codex at `.codex/skills/`.

| Request | Skill | Fallback path |
|---|---|---|
| Plan, design, architect, or scope a change without implementing it | `plan-code` | `.agents/skills/plan-code/SKILL.md` |
| Harden an approved plan before implementation; "audit this plan", "run the loop" | `plan-audit` | `.agents/skills/plan-audit/SKILL.md` |
| Build, create, add, implement, change, or fix anything | `wave-manager` | `.agents/skills/wave-manager/SKILL.md` plus `.claude/agents/wave-implementer.md` and `.claude/agents/wave-reviewer.md` |
| "Post edits", review or QA what was just built, audit a diff/branch/PR | `post-edits` | `.agents/skills/post-edits/SKILL.md` plus `.claude/agents/health-reviewer.md` and `.claude/agents/bug-confirmer.md` |
| Run a refactor target from `BACKLOG.md`'s queue | `refactor` | `.agents/skills/refactor/SKILL.md` |
| Map behavior, refresh the behavior map or refactor queue | `behavior-map` | `.agents/skills/behavior-map/SKILL.md` |
| Add or change any animation, transition, stagger, or haptic | `animations` | `.agents/skills/animations/SKILL.md` |
| Create, improve, shorten, or review an agent skill | `create-skill` | `.agents/skills/create-skill/SKILL.md` |
| Shape any answer for a reader | `clarity` | `.agents/skills/clarity/SKILL.md` |

`animations` supplies the motion spec in addition to whatever workflow the ladder picked; a motion change is not a presentation-only restyle, because it changes behavior over time.

### Workflow file locations

Skills name these by role or purpose; this table is the only place the paths live.

| What a skill calls it | Path in this repository |
|---|---|
| the plan directory | `.claude/plans/` |
| the refactor-log directory | `.claude/refactor-logs/` |
| the `wave-implementer` role definition | `.claude/agents/wave-implementer.md` |
| the `wave-reviewer` role definition | `.claude/agents/wave-reviewer.md` |
| the `health-reviewer` criteria file | `.claude/agents/health-reviewer.md` |
| the `bug-confirmer` criteria file | `.claude/agents/bug-confirmer.md` |

Claude Code registers the four role files as dispatchable agent types automatically. Codex loads the same files as plain briefs for its generic agent-spawn tool.

### Trivial self-service edits

Before routing an implementation request to `wave-manager`, check whether it asks for exactly one unambiguous literal replacement in one existing file. The intended effect must be obvious and isolated, with no dependent edit or design decision. Never classify a change as trivial self-service if it touches any protected area. If it qualifies, inspect the repository only to locate the exact edit; do not modify files, create a plan, invoke another workflow, spawn an agent, build, or test. Reply in at most two sentences: identify the file and the exact old and new expressions, then optionally name one quick manual check. If the user explicitly follows up asking the agent to perform the edit anyway, route that follow-up through `wave-manager`.

### Not a pipeline job

- Quick conversational questions ("what does this function do?") → answer inline.
- Read-only audits and investigations ("is there a bug in X?", "audit M0") → investigate and report inline; `post-edits` is for reviewing and *fixing* a change, and `plan-audit` is for auditing a plan.
- Diagnostic or temporary instrumentation → do it directly.
- Visual check requests ("does this screen match the mock?") → run the app, screenshot, compare inline.
- `post-edits` requires an existing implementation to review; for new work, implement via `wave-manager` first.

### Agent tier

Dispatched implementers, critics, and reviewers run on the strongest available implementation-tier model with fresh context. The session that plans and adjudicates keeps its own model. Never run a reviewer on the same context that wrote the code.

## 12. Health-Check Scopes

The `post-edits` pipeline reviews relevant scopes inline and sequentially in the main context. It must not delegate these scopes to subagents.

| Scope | File globs | Focus areas | Project-specific patterns to flag |
|---|---|---|---|
| **db** | `packages/db/**` | Migration ledger immutability and ordering, grants and column-level privileges, `SECURITY DEFINER` search paths, trigger side effects, seed/verify drift, reset safety | Schema changes live only in numbered migrations; runtime processes never migrate; `db:reset` must reject a non-local host |
| **api** | `apps/api/**`, `packages/api-client/**`, `packages/schemas/**` | Session derivation, per-user scoping on every read/update/delete, Zod validation on every route, stable error envelope, redaction, graceful shutdown | `user_id` comes only from the verified session, never from a route param, body, or socket payload; identical not-found for another user's row |
| **monitor** | `apps/monitor/**` | Loop cadence, backoff and circuit breakers, `fire_alert` usage, delivery outbox draining, advisory-lock maintenance jobs | Proxy credentials never logged, never in `OfferSnapshot.raw`, never leave the monitor; single replica assumed |
| **client** | `apps/desktop/**`, `apps/mobile/**`, `packages/data/**`, `packages/config/**`, `packages/tokens/**` | Query keys and invalidation, optimistic update rollback, offline and failure states, deep-link handling, accessibility | Customer UI never imports Drizzle, a PostgreSQL driver, or `packages/db`; strings from `config/strings.ts`, routes from `config/routes.ts`, no inline magic numbers |
| **domain** | `packages/domain/**` | Money arithmetic, eligibility state machine, date grouping | Integer cents everywhere — never a float; local-time day grouping across DST |
