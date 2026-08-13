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
