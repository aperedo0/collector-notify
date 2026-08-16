# Notify V1 Implementation Plan

Audience: an AI coding agent building this repo end to end. A human supervises. This document is the source of truth. `PRODUCT_SPEC.md` (screen states, tab meanings, interaction rules) still applies for UX behavior; this document adds every implementation decision the spec left open, and overrides `PRODUCT_SPEC.md` where the two conflict.

Visual styling comes from `docs/UI_HANDOFF.md` and its referenced screenshots. Build every screen and state functionally using the shared token and string modules below so visual tuning remains a token and CSS pass, not a rewrite.

## 0. Agent working rules

### 0.1 Source of truth order

```text
1. PLAN.md (this file)
2. PRODUCT_SPEC.md
3. docs/UI_HANDOFF.md (visuals only)
4. Existing automated tests
5. AGENTS.md
6. Existing implementation
```
Higher wins on conflict. Never resolve a conflict silently: STOP and report it. Do not ask for permission when this file already answers the question.

Handoff support files expected before M0:

- `CODEX_WORKFLOW.md`
- `docs/MOCKUP_INDEX.md`
- `docs/mockups/manifest.json`
- `docs/assets/README.md`
- `docs/COMPETITOR_RESEARCH.md` (background only)

`docs/DATA_SOURCE_REPORT.md` is not a pre-M0 handoff file; it is the M2.5
deliverable.

### 0.2 Rules

1. Read this whole file before writing any code.
2. Work one milestone at a time (Section 14) using the execution protocol in 14.0. Stop after each milestone's completion report.
3. Do not invent scope. If a needed decision is missing here, STOP and ask; do not guess silently.
4. Never store or transmit money as a float. Cents as integers everywhere (Section 7.1).
5. Customer data access goes through repository interfaces in `packages/data`, backed by the generated REST client in `packages/api-client`. Customer UI never imports Drizzle, a PostgreSQL driver, or server-only database code.
6. All user-facing strings come from `packages/config/strings.ts`, routes from `packages/config/routes.ts`. Every static limit/interval comes from a constants module (shared/client values in `packages/config/constants.ts`, API-only values in `apps/api/src/config.ts`, monitor-only values in `apps/monitor/src/config.ts`), unless this file explicitly assigns the value to the DB or to an environment variable. Never inline a magic number.
7. `pnpm lint && pnpm typecheck && pnpm test` must pass before a milestone is declared done.
8. Database credentials exist only in `apps/api`, `apps/monitor`, and migration jobs. Use separate least-privilege runtime roles for the API and monitor and a separate schema-owning migration role. Database credentials must never appear in `apps/desktop`, `apps/mobile`, client bundles, logs, or exceptions.
9. Do not implement real data sources until Milestone 9, and only after the human approves the approach (Section 7.6). Milestone 2.5 is research only.
10. Credentials and external accounts are human gates (Section 17). When one is missing at the milestone that needs it, STOP and request it in the report; never fake credentials, skip signing, or substitute providers to work around the gap.
11. Database changes are migration-only: every table, index, constraint, function, trigger, role grant, and seed change lives in the single ordered migration ledger under `packages/db/migrations`. Drizzle-generated and custom SQL migrations share that ledger and are immutable after application. Never auto-migrate at runtime or modify a hosted database by hand. If the work requires a DB change not defined in this file, STOP.
12. Dependencies: install a package only if this file names it, or the platform genuinely cannot do the task; in that second case, STOP and request approval first.
13. Proxy credentials are service-only and encrypted at rest (Section 7.9). They must never appear in `apps/desktop`, `apps/mobile`, any shared package, any client-reachable table, any log line, or any exception message (strip them on catch-and-rethrow), and never inside `OfferSnapshot.raw`.

### 0.3 Decision rights

```text
AGENT MAY DECIDE
- local variable and helper names
- file decomposition inside the prescribed feature structure
- implementation details that change no interface, behavior, or contract
- test fixture organization
- CSS needed to reproduce the supplied tokens

AGENT MAY NOT DECIDE
- product behavior, screens, navigation, user-facing strings
- database schema, authorization model, or migrations beyond Section 6
- new dependencies, new services, new environment variables
- polling, retry, cooldown, or confirmation strategy changes
- money representation
- security model (Electron flags, preload surface, secret placement)
```

## 1. Locked decisions (decision log)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | API boundary | One Fastify modular monolith in `apps/api`. Customer data routes are REST/JSON under `/v1`; Better Auth is mounted at `/api/auth`. Desktop and mobile never connect to PostgreSQL. | The API is the tenant-security boundary and a stable long-term seam. One service avoids premature microservices while keeping clients independent of the database and hosting provider. |
| D2 | Auth | Better Auth with its Drizzle adapter and official Electron and Expo integrations. Email + password is enabled with `requireEmailVerification: false`, so sign-up returns a usable session. Use its database sessions with the default seven-day expiry/one-day refresh; production cookies are HttpOnly and Secure. Minimal sign-in/sign-up UI only; Forgot Password and verification flows remain outside V1. Better Auth owns `users`, `sessions`, `accounts`, and `verifications` in PostgreSQL, configured for UUID IDs. | Auth stays in the project's own database without implementing password/session security from scratch. The platform integrations keep cookies/session material out of ordinary feature code. |
| D3 | Money | Integer cents end to end. DB `int`, TS `number` (cents). | Float money bugs are the most common agent-written defect. |
| D4 | One alert per product per user | Enforced by a partial unique index on `alerts(user_id, product_id) where deleted_at is null`. Creation and restoration use the locked API transactions in 6.2; UI "Alert Set" state derives from the alerts query. | The mockups assume it (a product card is either Alert Me or Alert Set); the original spec never stated it. |
| D5 | Delete + Undo | Soft delete (`deleted_at`) through the API; Undo calls the restore API transaction. The monitor purges deleted rows after 7 days. A restore that would exceed D15 or collide with a newly recreated alert skips that row silently and returns only the IDs actually restored. | Survives app close mid-undo-window; supports bulk undo; keeps create/restore under the same per-user lock so the alert cap cannot be bypassed. |
| D6 | Trigger semantics | Edge-triggered arming per alert with a 30 minute safety cooldown (Section 7.3). Create, price edit, and pause/resume re-arm the alert and clear the cooldown (D22), so a currently eligible product fires within `confirm_observations` poll cycles (default 1) of the change. | Prevents both re-notify spam while an offer stays live and missed alerts after dips. |
| D7 | Realtime | PostgreSQL `LISTEN/NOTIFY` from row triggers wakes the API, which relays authenticated, user-scoped invalidation messages over WebSockets. Notifications contain only `user_id`, event type, and entity ID; clients refetch REST resources and refetch all subscribed resources after reconnect. Each API replica owns one dedicated direct (non-PgBouncer) listener connection, so multiple API replicas remain supported without Redis. Redis pub/sub or NATS is introduced only when measured volume, cross-region deployment, or operational needs require it. | `NOTIFY` is intentionally a non-durable wake-up hint; PostgreSQL and REST remain authoritative, so dropped messages cannot corrupt state. |
| D8 | Desktop notifications | No server push to desktop. Electron main owns the authenticated WebSocket and raises native `Notification`s while the process is running, including when the window is hidden to tray. | Electron cannot receive notifications while the process is stopped; WebSocket delivery while running is the honest model. |
| D9 | Mobile push | Expo Push Service from the monitor. Requires an EAS development build; push does not work in Expo Go on SDK 53+. Physical device needed for testing. | Current Expo reality. |
| D10 | State libraries | TanStack Query v5 for server state, Zustand for UI state (select mode, toasts), Zod for shared validation. | Named so the agent does not pick per-file. |
| D11 | Mutation policy | Server-confirmed for create, edit, delete (success UI only after the write lands). Optimistic with rollback for pause/resume toggles only. | Matches the spec's server-authoritative rule and its low-risk toggle exception. |
| D12 | Browse search | Fetch full catalog, filter client-side (case-insensitive substring on name, 150 ms debounce). | Curated catalog stays under a few hundred rows for a long time. |
| D13 | Immediate evaluation | Handled by DB-driven re-arming (D6), not client-to-monitor signaling. Evaluation resumes on the product's next poll; worst-case trigger latency = `confirm_observations x poll_interval_seconds` plus one monitor tick (defaults: 1 x 60s + 15s). | No extra transport needed, and the latency math stays consistent with D6 and D18. |
| D14 | Monorepo tooling + versions | pnpm workspaces + Turborepo, Node 24 LTS, TypeScript strict everywhere, React 19.2.x in BOTH apps, Expo SDK 57 (RN 0.86). | Expo SDK 57 requires React 19.2.3 and Node 22.13.x or newer; Node 24 is the current LTS and satisfies that floor. One language and one React major across every process. |
| D15 | Alert cap | Max 50 NON-DELETED alerts per user (active and paused together). The API create and restore transactions serialize on the user's `user_preferences` row before counting `deleted_at is null`; clients have no database access. | The row lock makes the limit atomic under concurrent creates/restores. Counting only status-active would let paused alerts hoard unlimited quota. |
| D16 | Alert link-out | Notification tap opens Recent Detail, which carries a primary "Open at Target" button (external `product_url`). Product Details gets the same link secondary. Overrides the original spec's "no View on Target" rule. | Guppy and every competitor deep-link alerts to the retailer page; the product's whole job is getting the user to the buy button in seconds. Also creates the affiliate-revenue seam Guppy monetizes. |
| D17 | Plans + priority dispatch | `plan` column on user_preferences (`free` default, `basic`, `plus`). Push dispatch sends in plan order: plus, basic, free. V1 is free for everyone; the seam exists from day one. | Mirrors Guppy's tiering (Basic alerts, Plus automation, "priority alerts" as the paid perk). |
| D18 | False-alarm damping | Per-alert `consecutive_eligible` streak; firing requires the streak to reach `products.confirm_observations` (a per-product COLUMN, default 1; deliberately not a global constant). | Guppy filters noise with community-verified "swarm" confirmations; a consecutive-observation gate is the single-source equivalent. |
| D19 | Real data source order | At M9, evaluate a licensed commercial retail stock/price feed first (`FeedOfferSource`); own Target adapter second. US retailers only in V1. | A licensed feed avoids owning a fragile retailer adapter if the M2.5 report shows coverage, latency, cost, and usage rights pass the bar, regardless of how any competitor procures data (Guppy's procurement model is unverified; see docs/COMPETITOR_RESEARCH.md). US-only matches the market and Guppy's stated territory. |
| D20 | Auto-Buy posture (future) | Local desktop agent driving the user's own logged-in browser session. Credentials and checkout never touch the cloud. | Exactly Guppy's model: local-only automation, they never see passwords, browser session traffic looks like a normal user. They also started as a Chrome extension and later shipped a desktop app; user reviews attribute the switch to extension reliability problems (inference, see docs/COMPETITOR_RESEARCH.md). Notify skips straight to the desktop app. |
| D21 | Notification preference semantics | One account-wide `user_preferences.notifications_enabled` (renamed from push_enabled). Off means `fire_alert` enqueues no pushes AND Electron main suppresses native notifications. Recent history records regardless. Per-device settings wait for the Auto-Buy-era devices table. | The spec has a single Notifications screen, which implies a single switch; a half-global, half-mobile flag is the worst of both. |
| D22 | Re-arm semantics | Explicit user actions (create, price edit, pause/resume) reset the confirmation streak AND clear the cooldown, via the DB trigger. Automatic re-arms from an ineligible poll reset the streak in the loop but keep the cooldown. | An edit is the user asking for a fresh evaluation now; the cooldown exists to throttle automatic flapping, not deliberate user actions. |
| D23 | Firing authority (split) | `fire_alert` locks the trigger-state row (FOR UPDATE) and is the final authority for armed state, cooldown, the CURRENT price threshold, alert liveness, product active status, and duplicate firing. The monitor remains the sole authority for source eligibility and the confirmation count; the DB does not re-verify `consecutive_eligible`. | The database contract stays correct under concurrent or duplicated monitors for everything it owns, without baking loop mechanics into SQL. A future agent must not assume the DB validates every firing condition. |
| D24 | Proxy support (monitor-only) | `TargetOfferSource` fetches through a service-only `ProxyPool` of named groups, imported from TXT/CSV (JSON optional) by monitor CLI. Failover is health-based and triggers ONLY on proxy/network transport failure. Retailer responses (403/429/5xx/challenge) never rotate proxies and drive the source-wide breaker; a parse failure also never rotates but stays product-specific. Credentials are encrypted at rest with a monitor-only key and never reach clients. A commercial `FeedOfferSource` typically needs no proxies. | The price checker is central and developer-operated (D1); pooled proxies with health/cooldown are standard resilient-fetcher infrastructure. Keeping rotation strictly for transport failures preserves distinct proxy, retailer, and product-data error classes for debugging and keeps proxy switching from becoming an anti-bot/rate-limit evasion mechanism. |
| D25 | PostgreSQL hosting | PostgreSQL 17 on Neon for hosted environments; PostgreSQL 17 in Docker for local development. Production disables scale-to-zero because the API requires a continuously connected listener. The schema/query layer is portable PostgreSQL, but a future provider move is an ordinary database migration and operational cutover, not merely a connection-string edit. | PostgreSQL 17 is stable and supported through November 2029. Neon minimizes early operations without making clients provider-specific. |
| D26 | Data access | Drizzle ORM for ordinary queries; PostgreSQL constraints, partial indexes, row locks, triggers, and `fire_alert` remain the hard integrity floor. Drizzle Kit owns a single migration ledger with custom SQL migrations for functions, triggers, and grants. | Application ergonomics do not replace database correctness or concurrency control. |
| D27 | API contracts | Every `/v1` route has Zod request, parameter, query, and response schemas. Fastify response schemas prevent accidental field leakage. OpenAPI is generated from those route schemas, and `packages/api-client` is generated from OpenAPI. WebSocket messages use a separate versioned Zod schema because OpenAPI does not describe WebSockets. | One wire-contract source prevents handwritten client/server drift. |
| D28 | Authorization | RLS is not used because no customer client reaches PostgreSQL. The API derives `user_id` from the verified Better Auth session and scopes every user-owned query itself; request bodies and route IDs never establish ownership. Two-user isolation tests are mandatory for every user-owned route/repository. | Removing direct database access makes the API the only tenant boundary, so ownership checks must be explicit and tested. |
| D29 | WebSocket authentication | A signed-in client requests a single-use `/v1/realtime-ticket` that expires after 60 seconds, then presents it during WebSocket establishment using the `Sec-WebSocket-Protocol` header. The API atomically consumes the ticket and binds the socket to that session's user. Long-lived session material never appears in a URL or log. | Electron and Expo get one consistent transport without depending on platform-specific WebSocket cookie behavior. |
| D30 | Database roles | `notify_migrator` owns schema/migrations, `notify_api` serves customer and auth traffic, and `notify_monitor` runs polling, `fire_alert`, outbox, maintenance, and operator CLIs. `notify_api` and `notify_monitor` are not owners; only `notify_monitor` may execute `fire_alert`. | Least privilege limits the blast radius of either runtime service. |
| D31 | API request security | Production API and WebSocket traffic is HTTPS/WSS only. CORS and Better Auth trusted origins are exact allowlists. Every state-changing `/v1` request requires JSON plus `X-Notify-Client: desktop` or `mobile`; unexpected browser origins are rejected before auth. Better Auth keeps its production rate limiter, and Fastify rate-limits auth-sensitive and mutation routes. | Cookie sessions require a deliberate cross-site request boundary even though V1 clients are native applications. |
| D32 | `fire_alert` null arguments | `fire_alert` raises when any of `p_alert_id`, `p_trigger_key`, `p_price_cents`, or `p_cooldown_minutes` is null. All four are required; the function never treats a missing argument as a defaulted one. | A null cooldown makes the cooldown predicate evaluate to null, which reads as false, so a fire that should have been throttled proceeds — verified against a live alert correctly blocked at 30 minutes. A null price makes the threshold comparison null, so the alert silently never fires. Defaulting either one hides a caller bug; declaring the function `STRICT` would make a null argument indistinguishable from "not fireable", which is the worse failure for a product whose job is firing alerts. The monitor is the only grantee and arrives at M2, so a loud failure costs nothing. Section 14's scope table makes `packages/db/migrations/**` off-limits from M1.5 onward, so M0 is the only milestone that can add the guard. |
| D33 | `@types/node` | Not added. `packages/db` and `apps/api` keep their hand-declared runtime shims, and code needing a module path uses a local cast rather than relying on ambient Node types. | The package buys three copies of a four-line type declaration and one path bug that already fails loudly. A cast-based helper compiles under the repository's `tsconfig.base.json` with no new dependency, keeping Section 14's approved M0 dependency list exactly as written. M8 revisits tooling and can reconsider it there with nothing lost in the meantime. |
| D34 | Indexes for the 6.5 maintenance purges | Not added in V1. `recent_events.occurred_at`, `offer_observations.observed_at`, and `alerts.deleted_at` stay unindexed and the purges sequentially scan. Revisit when the catalog passes roughly 50 products or a purge exceeds one second. | Measured, not estimated: at the seeded cadence the 30-day `offer_observations` window holds 864,000 rows, and deleting the 288,095 expired ones takes 119 ms — once per day. An index would save a tenth of a second daily and charge a write against roughly 28,800 daily inserts. `alerts` and `recent_events` are smaller still. Because Section 14 also blocks migrations after M0, an unnecessary index would be equally stuck; skipping one that is later needed costs only a slow background job. |
| D35 | `alerts_rearm` fires only on a real change | The re-arm trigger is split in two: an unconditional `AFTER INSERT` trigger, and an `AFTER UPDATE OF price_threshold_cents, status` trigger carrying `WHEN (old.price_threshold_cents IS DISTINCT FROM new.price_threshold_cents OR old.status IS DISTINCT FROM new.status)`. A save that changes neither field no longer re-arms. | PostgreSQL's `UPDATE OF col` fires on column *mention*, not on a changed value, and the statement 6.2 authorises for "Update alert" writes both columns on every save. Reproduced: fire an alert, then re-save it with identical values — `armed` returns to true, `last_triggered_at` is cleared, and the next poll fires a second event and a second push 0.13 s later. Any authenticated client could bypass `MIN_RETRIGGER_MINUTES` indefinitely. The split is forced: a `WHEN` clause referencing `OLD` is invalid on an INSERT trigger. Section 14's scope table makes `packages/db/migrations/**` off-limits from M1.5 onward, so M0 is the only milestone that can fix it. |
| D36 | pnpm overrides | The `lodash` override is scoped to all three declaring parents — `chevrotain`, `@chevrotain/gast`, `@chevrotain/cst-dts-gen` — rather than left unscoped. `@esbuild-kit/core-utils>esbuild` stays as-is. Both carry a comment recording why they exist and that Section 14's M0 list does not name them. | An unscoped override silently applies to every package M1–M9 adds. All three chevrotain packages declare an exact `lodash: 4.17.21`, and pnpm's `parent>child` selector matches only the direct edge, so scoping to `chevrotain` alone reintroduces 4.17.21 for the other two — verified with an isolated `pnpm install --lockfile-only` probe producing both versions. Naming all three keeps resolution byte-identical to today while bounding future packages. Rule 0.2.12 reserves dependency decisions, and neither override was previously recorded. |
| D37 | Node version pin | `.node-version` is left at its current value. | It pins a patch that is not the one every green run was produced on, but confirming whether that version exists needs network access this session does not have. Downgrading root tooling on an unverifiable premise can only make the pin worse, and no check in the M0 gate reads the interpreter. Deferred to M8's tooling pass, which Section 14 already places after network-dependent verification. |
| D38 | `erasableSyntaxOnly` | Added to `tsconfig.base.json`. | Preventive, not a fix — both packages compile with it today. Every `packages/db` entry point runs under Node's type stripping (D33), so an `enum`, `namespace`, or constructor parameter property added anywhere under `packages/db/src` passes `pnpm lint` and `pnpm typecheck` and then kills the process at load with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The documented gate structurally cannot catch that class. No dependency and no behavior change, but Section 14's global exception covers root tooling only as a consequence of already-approved work, so it is recorded here. |

## 2. What changed vs the original spec

1. `apps/api` is restored as the single Fastify modular monolith (D1). Customer routes are REST/JSON under `/v1`; Better Auth routes live under `/api/auth`.
2. `packages/api-client` is generated from OpenAPI; `packages/data` exposes repositories that wrap that client so screens remain backend-agnostic.
3. Build order changed: the monitor with a fake offer source is built before any UI (Milestones 0 to 2), so the whole pipeline (offer -> eligibility -> event -> notification) is testable end to end from day one via a CLI, with no Target integration and no screens.
4. Everything in Sections 5 to 13 is concrete: schema, API authorization, trigger state machine, idempotency keys, undo mechanics, realtime transport, secure Electron session handling, push credential reality, screen-to-data map, and per-milestone acceptance checks.
5. Competitor research on Guppy (guppy.so, DropKit Inc.) added decisions D16 to D20; the research itself lives in docs/COMPETITOR_RESEARCH.md (background only, Section 18).
6. External review fixed the confirmation/arming interaction, retired-product detail behavior, plan-field authorization, atomic `fire_alert`, monitor state, price/purchasable definitions, Electron input validation, the catalog CLI, Milestone 2.5, and the execution protocol in 14.0. This architecture revision keeps those decisions and moves their enforcement behind the API and PostgreSQL roles.

## 3. Stack

```text
Monorepo      pnpm workspaces + Turborepo, TypeScript strict, Node 24 LTS
Desktop       Electron + electron-vite + React 19.2.x + electron-builder + electron-updater
Mobile        Expo SDK 57 (React Native 0.86, React 19.2.x) + expo-router + expo-notifications + expo-secure-store + expo-network
API           apps/api: Fastify modular monolith, REST/JSON /v1, OpenAPI, WebSockets, Better Auth
Database      PostgreSQL 17: Neon hosted, Docker local; Drizzle ORM + Drizzle Kit migrations
Worker        apps/monitor: Node 24 service, Drizzle/Postgres, axios HTTP client, https-proxy-agent + socks-proxy-agent for proxy transport, node:crypto for AES-256-GCM/HKDF/HMAC (no crypto dep), pino logs, Docker
Client state  TanStack Query v5 + Zustand
Validation    Zod wire schemas in packages/schemas; generated OpenAPI client
Tests         Vitest, Docker PostgreSQL integration tests, API authorization tests, Playwright desktop smoke
```

Version policy: D14's Node, Expo, React Native, React, and PostgreSQL major/minor choices are locked. At each scaffold milestone choose the latest compatible stable patch, verify compatibility in official documentation, and pin exact package versions in the lockfile. For Electron, choose the latest stable major supported by the pinned `@better-auth/electron` release at M3. Do not mix React major versions across apps or silently upgrade a locked platform version.

## 4. Repository layout

```text
notify/
  apps/
    api/                # Fastify HTTP/WebSocket service + Better Auth
    desktop/            # Electron: main/, preload/, renderer/
    mobile/             # Expo app
    monitor/            # polling worker + dispatch; src/{loop, sources/, proxy/, cli/}
  packages/
    domain/             # pure TS: entities, money utils, eligibility engine, date grouping
    schemas/            # Zod REST DTOs, WebSocket events, domain parsers
    api-client/         # generated from OpenAPI; never edited by hand
    data/               # client repository interfaces + generated-client adapters
    db/                 # SERVER-ONLY Drizzle schema, queries, migrations, seeds
    config/             # routes.ts, strings.ts, constants.ts, analytics-events.ts
    tokens/             # design tokens informed by docs/UI_HANDOFF.md
  compose.yaml          # local PostgreSQL 17 only
  docs/                 # DATA_SOURCE_REPORT.md (M2.5), COMPETITOR_RESEARCH.md
  turbo.json  pnpm-workspace.yaml  tsconfig.base.json  .npmrc
```

Feature-module rule inside each app (identical names on both platforms):

```text
src/features/{home,browse,products,alerts,recent,account,auth}/
```

API module rule:

```text
apps/api/src/modules/{auth,products,alerts,recent,preferences,push-tokens,realtime,health}/
```

Each API module owns its Fastify routes, service logic, and scoped database queries. Modules communicate through typed functions inside the same process; do not create network calls, queues, or separately deployed services between them.

Expo in a pnpm monorepo: Expo supports monorepos; if Metro resolution fails, set `node-linker=hoisted` in `.npmrc` and reinstall.

## 5. Environment variables

This list is exhaustive. A new variable is a MAY-NOT-decide item (0.2): STOP and ask.

```text
# apps/desktop (.env)
API_URL=                         # public origin used only by Electron main
VITE_SENTRY_DSN=                  # blank until M8

# apps/mobile (.env, read into app.config.ts)
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_SENTRY_DSN=           # blank until M8
EXPO_PUBLIC_EAS_PROJECT_ID=       # set at M7 by eas init

# apps/api (.env, secret unless explicitly public)
DATABASE_URL=                     # pooled Neon URL in hosted env; local Docker URL in development
DATABASE_DIRECT_URL=              # direct notify_api URL for LISTEN; may equal DATABASE_URL locally
BETTER_AUTH_SECRET=               # at least 32 random bytes; never exposed to clients
BETTER_AUTH_URL=                  # public API origin, e.g. https://api.example.com
TRUSTED_ORIGINS=                  # comma-separated exact origins/schemes; no wildcard in production
PORT=8080
LOG_LEVEL=info
SENTRY_DSN=                       # blank until M8

# apps/monitor (.env, secret)
DATABASE_URL=                     # notify_monitor role; never the owner/migrator credential
OFFER_SOURCE=fake                 # fake | feed | target
MONITOR_TICK_SECONDS=15            # loop cadence; product polling frequency comes ONLY from products.poll_interval_seconds
PORT=8081                         # healthz listener; API uses 8080 locally
LOG_LEVEL=info
SENTRY_DSN=                       # blank until M8
PROXY_ENC_KEY=                    # base64 32 bytes; REQUIRED for TargetOfferSource AND any proxy command that encrypts/decrypts creds (proxy:import/list/test); encrypts proxy creds at rest (7.9)
PROXY_HEALTHCHECK_URL=https://api.ipify.org   # neutral URL for `proxy:test` only; never Target

# migration/release job only
DATABASE_MIGRATION_URL=           # direct notify_migrator URL; never loaded by API, monitor, or clients
GH_TOKEN=                         # GitHub Actions/release job only; publishes draft Electron releases
```

Platform signing credentials are not application environment variables. Keep
Apple/EAS/Firebase and desktop code-signing credentials only in their provider's
credential store or the CI secret store, using the exact names required by the
chosen release tooling at M7/M8. They must never be copied into repository `.env`
files or loaded by a runtime process.

## 6. PostgreSQL database and migrations

PostgreSQL 17 runs in Docker locally and on Neon when hosted. All timestamps are `timestamptz`; all money is integer cents. Enable only `pgcrypto` for `gen_random_uuid()`. Do not depend on Neon-only features.

`packages/db` is server-only. Its Drizzle schema is the TypeScript model for ordinary queries, and `packages/db/migrations` is the one ordered, immutable migration ledger. Generate ordinary migrations with Drizzle Kit; add functions, triggers, role grants, and other PostgreSQL-specific work as custom SQL in the same sequence. Better Auth schema generation updates the checked-in Drizzle schema first; Drizzle Kit then generates the reviewed migration. Neither Better Auth nor Drizzle may migrate a hosted database at application startup.

The Better Auth configuration must use the Drizzle adapter with `advanced.database.generateId = 'uuid'` and plural model names `users`, `sessions`, `accounts`, and `verifications`. The generated core auth schema is required in the initial migration and owns its columns. All domain `user_id` foreign keys below reference `users(id)`. Pin the Better Auth version; any upgrade that changes its generated schema requires a normal reviewed migration.

### 6.1 Tables

```sql
create table products (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  name                      text not null,
  image_url                 text,
  product_url               text,                   -- retailer product page for "Open at Target" (D16)
  retailer                  text not null default 'target',
  retailer_product_id       text not null,          -- Target TCIN
  default_alert_price_cents int  not null check (default_alert_price_cents between 100 and 999999),
  is_active                 boolean not null default true,
  is_suggested              boolean not null default false,
  suggested_rank            int,
  poll_interval_seconds     int not null default 60,
  confirm_observations      int not null default 1 check (confirm_observations between 1 and 5),  -- D18
  created_at                timestamptz not null default now(),
  unique (retailer, retailer_product_id)
);

create table alerts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  product_id            uuid not null references products(id),
  price_threshold_cents int  not null check (price_threshold_cents between 100 and 999999),
  status                text not null default 'active' check (status in ('active','paused')),
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index alerts_one_active_per_product
  on alerts (user_id, product_id) where deleted_at is null;
create index alerts_by_product on alerts (product_id) where deleted_at is null;

-- server-only trigger bookkeeping
create table alert_trigger_state (
  alert_id             uuid primary key references alerts(id) on delete cascade,
  armed                boolean not null default true,
  consecutive_eligible int not null default 0,       -- D18 damping
  last_triggered_at    timestamptz,
  updated_at           timestamptz not null default now()
);

-- monitor scheduling + circuit breaker, service-only; rows upserted lazily by the monitor
create table monitor_product_state (
  product_id         uuid primary key references products(id) on delete cascade,
  last_polled_at     timestamptz,
  consecutive_errors int not null default 0,
  backoff_until      timestamptz,
  updated_at         timestamptz not null default now()
);

-- raw poll results, service-only, 30 day retention
create table offer_observations (
  id               bigint generated always as identity primary key,
  product_id       uuid not null references products(id),
  observed_at      timestamptz not null default now(),
  purchasable      boolean not null,
  best_price_cents int,                              -- lowest purchasable online offer; null if none
  raw              jsonb
);
create index offer_obs_by_product on offer_observations (product_id, observed_at desc);

create table recent_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  alert_id    uuid references alerts(id) on delete set null,
  product_id  uuid not null references products(id),
  type        text not null default 'alert_triggered',   -- future: autobuy_success, autobuy_failed, autobuy_action_required
  price_cents int  not null,
  retailer    text not null default 'target',
  occurred_at timestamptz not null default now(),
  trigger_key text not null,
  unique (alert_id, trigger_key)                          -- idempotency (Section 7.4)
);
create index recent_by_user on recent_events (user_id, occurred_at desc);

create table push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  platform        text not null check (platform in ('ios','android')),
  expo_push_token text not null unique,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create table notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references recent_events(id) on delete cascade,
  channel         text not null check (channel in ('expo_push')),
  target          text not null,                          -- the push token
  status          text not null default 'pending',        -- pending | sent | receipt_ok | receipt_error | failed
  attempt_count   int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  ticket_id       text,
  created_at      timestamptz not null default now(),
  unique (event_id, channel, target)
);

create table user_preferences (
  user_id      uuid primary key references users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  plan         text not null default 'free' check (plan in ('free','basic','plus')),  -- D17; server-managed, see 6.2 + 6.3
  updated_at   timestamptz not null default now()
);

-- fake offer control surface for dev/testing (service-only, Section 7.5)
create table fake_offers (
  product_id       uuid primary key references products(id),
  purchasable      boolean not null default false,
  best_price_cents int,
  updated_at       timestamptz not null default now()
);

-- proxy pool for TargetOfferSource (service-only, Section 7.9). PROXY_ENC_KEY is a
-- 32-byte master secret; two 32-byte subkeys are derived with HKDF-SHA256
-- using the fixed UTF-8 salt "notify-proxy-hkdf-salt-v1" (node:crypto):
-- info "proxy-encryption-v1" (AES-256-GCM) and info "proxy-fingerprint-v1" (HMAC).
-- Credentials use a 12-byte random nonce and 16-byte GCM tag and are stored as
-- text "v1:<base64(nonce|ciphertext|tag)>". username_fp =
-- base64(hmac-sha256(fp_subkey, trimmed exact-case username)) enables dedup over the
-- non-deterministic GCM ciphertext (usernames are NOT lowercased: UserA != usera).
create table proxy_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table proxy_endpoints (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references proxy_groups(id) on delete cascade,
  protocol             text not null check (protocol in ('http','https','socks5')),
  host                 text not null,
  port                 int  not null check (port between 1 and 65535),
  username_enc         text,                       -- encrypted; null if no auth
  password_enc         text,                       -- encrypted; null if no auth
  username_fp          text not null default '',   -- base64(hmac(fp_subkey, trimmed exact-case username)); see 7.9
  enabled              boolean not null default true,
  consecutive_failures int not null default 0,
  cooldown_until       timestamptz,
  last_success_at      timestamptz,
  last_failure_at      timestamptz,
  created_at           timestamptz not null default now(),
  unique (group_id, protocol, host, port, username_fp)   -- idempotent import key
);
create index proxy_by_group on proxy_endpoints (group_id) where enabled;

-- binds a source to the proxy group it uses; set by `proxy:use`
create table monitor_source_config (
  source         text primary key,                 -- e.g. 'target'
  proxy_group_id uuid references proxy_groups(id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- source-wide circuit breaker (service-only). A retailer-wide rejection wave
-- (repeated 429/challenge across products) trips this and pauses the WHOLE source;
-- an isolated product parse/data error stays in monitor_product_state instead.
create table monitor_source_state (
  source           text primary key,
  consecutive_errors int not null default 0,
  backoff_until    timestamptz,
  last_error_at    timestamptz,
  updated_at       timestamptz not null default now()
);

-- API-only, short-lived, single-use WebSocket handshake tickets (D29).
-- Store only a SHA-256 hash of the random ticket; the plaintext is returned once.
create table realtime_tickets (
  ticket_hash bytea primary key,                    -- raw 32-byte SHA-256 digest
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index realtime_tickets_expiry on realtime_tickets (expires_at);

-- Monitor-owned scheduler ledger. Jobs are idempotent and run after restart if overdue.
create table maintenance_job_state (
  job_name          text primary key,
  last_completed_at timestamptz,
  updated_at        timestamptz not null default now()
);
```

### 6.2 Triggers

```sql
create or replace function public.set_updated_at() returns trigger
language plpgsql as $fn$
begin new.updated_at = now(); return new; end $fn$;

create trigger alerts_touch before update on alerts
  for each row execute function public.set_updated_at();
create trigger prefs_touch before update on user_preferences
  for each row execute function public.set_updated_at();

-- Explicit user actions re-arm AND reset (D22): create, price edit, and status
-- change restart the confirmation streak and clear the cooldown. Automatic
-- re-arms (an ineligible poll) happen in the monitor and keep the cooldown.
create or replace function public.rearm_alert() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into alert_trigger_state (alert_id, armed)
  values (new.id, true)
  on conflict (alert_id) do update
    set armed = true, consecutive_eligible = 0,
        last_triggered_at = null, updated_at = now();
  return new;
end $fn$;

create trigger alerts_rearm_insert
  after insert on alerts
  for each row execute function public.rearm_alert();

-- D35: `update of` fires on column MENTION, so a no-op save would clear the cooldown.
-- The WHEN clause requires a changed value. It must be a separate trigger: a WHEN
-- referencing OLD is invalid on an INSERT trigger.
create trigger alerts_rearm_update
  after update of price_threshold_cents, status on alerts
  for each row
  when (old.price_threshold_cents is distinct from new.price_threshold_cents
        or old.status is distinct from new.status)
  execute function public.rearm_alert();

-- Atomic fire and FINAL AUTHORITY (D23): the row lock plus armed, cooldown, and
-- CURRENT-threshold checks here decide firing; decide() in the monitor only
-- avoids pointless database calls. The threshold re-check closes the stale-price race:
-- if the user lowers the threshold after the monitor read but before this call,
-- the fire is refused. Event insert + disarm + delivery outbox commit together,
-- idempotent on (alert_id, trigger_key).
create or replace function public.fire_alert(
  p_alert_id uuid, p_trigger_key text, p_price_cents int, p_cooldown_minutes int
) returns uuid   -- new recent_events.id, or null if not fireable / already fired
language plpgsql security definer set search_path = public as $fn$
declare v_event_id uuid; v_user_id uuid; v_state alert_trigger_state%rowtype;
begin
  -- D32: every argument is required; a null silently corrupts the checks below
  if p_alert_id is null or p_trigger_key is null
     or p_price_cents is null or p_cooldown_minutes is null
  then
    raise exception 'fire_alert requires non-null arguments';
  end if;

  select * into v_state from alert_trigger_state
   where alert_id = p_alert_id
   for update;
  if not found or not v_state.armed then return null; end if;
  if v_state.last_triggered_at is not null
     and v_state.last_triggered_at > now() - make_interval(mins => p_cooldown_minutes)
  then return null; end if;

  insert into recent_events (user_id, alert_id, product_id, type, price_cents, trigger_key)
  select a.user_id, a.id, a.product_id, 'alert_triggered', p_price_cents, p_trigger_key
    from alerts a
    join products p on p.id = a.product_id
   where a.id = p_alert_id and a.deleted_at is null and a.status = 'active'
     and p.is_active
     and p_price_cents <= a.price_threshold_cents
  on conflict (alert_id, trigger_key) do nothing
  returning id, user_id into v_event_id, v_user_id;
  if v_event_id is null then return null; end if;

  update alert_trigger_state
     set armed = false, last_triggered_at = now(), updated_at = now()
   where alert_id = p_alert_id;

  -- delivery outbox: drained by the dispatcher (7.7); a crash after this commit
  -- can never lose a push, because the pending rows survive the restart
  insert into notification_deliveries (event_id, channel, target)
  select v_event_id, 'expo_push', t.expo_push_token
    from push_tokens t
    join user_preferences up on up.user_id = t.user_id
   where t.user_id = v_user_id and up.notifications_enabled
  on conflict (event_id, channel, target) do nothing;

  return v_event_id;
end $fn$;
revoke execute on function public.fire_alert(uuid, text, int, int)
  from public, notify_api;
grant  execute on function public.fire_alert(uuid, text, int, int)
  to notify_monitor;   -- the monitor is the only intended caller

-- user_preferences rows are created inside the same database commit as a Better
-- Auth user row. Customer clients never insert them.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $fn$;
create trigger on_auth_user_created
  after insert on users
  for each row execute function public.handle_new_user();

```

API mutation invariants, implemented with Drizzle transactions:

- Create alert: derive `userId` from the session; begin; lock that user's `user_preferences` row `FOR UPDATE`; verify the product is active; count non-deleted alerts; reject at 50 with the stable `alert_limit_reached` error code; insert. Map the partial-unique violation to conflict. The transaction commits before success is returned.
- Soft delete: update only rows matching both `user_id = session.user.id` and the supplied IDs; return only changed IDs. The API never hard-deletes customer alerts.
- Restore: begin; lock the user's preferences row; count non-deleted alerts; process requested IDs in request order, restoring only rows owned by that user while capacity remains and no live alert exists for the product; return only restored IDs; commit once.
- Update alert: update only rows matching the session user and `deleted_at is null`; accept only `price_threshold_cents` and `status`. The update trigger above re-arms only when one of those fields actually changes (D35); a save that writes identical values leaves the cooldown intact.
- Preferences: update only `notifications_enabled` for the session user. `plan` is never accepted by a customer DTO or update statement.
- Push token registration: one `INSERT ... ON CONFLICT (expo_push_token) DO UPDATE` atomically assigns the token to the current session user and refreshes platform/`last_seen_at`. Unregister deletes only where both token and session user match.

### 6.3 Roles, grants, and API authorization

RLS is intentionally not enabled because desktop and mobile have no PostgreSQL credentials. Provision the three roles from D30 before migrations. Local Docker initialization creates them; hosted role provisioning is an M8 deployment gate. The migration ledger revokes default `public` access and grants only what each runtime needs:

Before object grants, revoke `CREATE` on schema `public` and all default table, sequence, and function privileges from PostgreSQL's `PUBLIC` role. Set `notify_migrator` default privileges so newly migrated objects are not automatically exposed. Runtime roles receive explicit grants only; neither gets ownership, schema creation, role management, or bypass privileges.

`pgcrypto` is a trusted extension, so PostgreSQL initially owns its contained functions with the environment's bootstrap superuser rather than the role that installs it. Environment provisioning therefore installs `pgcrypto` as `notify_migrator`, transfers only its member functions to that non-runtime migration role, revokes `PUBLIC` execution from every extension function, and grants `EXECUTE` on only `public.gen_random_uuid()` to `notify_migrator`, `notify_api`, and `notify_monitor`. The initial migration retains `CREATE EXTENSION IF NOT EXISTS pgcrypto` as the ledger declaration and fails closed if provisioning left any pgcrypto function executable by `PUBLIC` or omitted the required UUID grants. Local `db:reset` preserves this provisioned extension while rebuilding the application schema.

```text
notify_migrator
  owns the schema and applies migrations; never loaded by a runtime process

notify_api
  Better Auth CRUD on users, sessions, accounts, verifications
  SELECT on products
  SELECT/INSERT on alerts; UPDATE only price_threshold_cents, status, deleted_at
  SELECT on recent_events
  SELECT/INSERT/UPDATE/DELETE on push_tokens
  SELECT on user_preferences; UPDATE only notifications_enabled
  SELECT only ticket_hash, user_id, expires_at, consumed_at plus
    INSERT/UPDATE/DELETE on realtime_tickets
  application code supplies the mandatory user scope for every line above
  NO access to alert trigger state, fake offers, proxy tables, offer observations,
    monitor state, maintenance state, or the delivery outbox
  NO EXECUTE on fire_alert

notify_monitor
  SELECT/INSERT/UPDATE on products; SELECT/DELETE on alerts and recent_events for
    monitoring plus scheduled retention; SELECT on user_preferences
  SELECT/DELETE on push_tokens
  CRUD on alert_trigger_state, monitor state, offer_observations, fake_offers,
    notification_deliveries, proxy tables, and maintenance_job_state
  SELECT only expires_at and consumed_at plus DELETE on expired/consumed
    realtime_tickets for scheduled maintenance
  INSERT on recent_events only through fire_alert
  EXECUTE fire_alert
  NO access to Better Auth sessions, accounts, verification data, or passwords
```

Database grants are defense in depth, not tenant authorization. Every authenticated API handler obtains the session with Better Auth, derives `userId` on the server, and passes that value into the query/function. A route parameter, request body, WebSocket payload, or client-supplied filter may never supply or replace the authenticated user ID. Every read/update/delete of user-owned data includes `where user_id = session.user.id`; missing rows return the same not-found response regardless of whether they belong to another user.

### 6.4 Realtime triggers

Create one `AFTER INSERT OR UPDATE` trigger for `alerts`, one `AFTER INSERT` trigger for `recent_events`, and one `AFTER INSERT OR UPDATE` trigger for `user_preferences`. Each calls `pg_notify('notify_realtime', payload)` where the compact JSON payload contains only:

```json
{"v":1,"userId":"<uuid>","type":"alerts.changed|recent.created|preferences.changed","entityId":"<uuid>"}
```

The payload must remain below PostgreSQL's `NOTIFY` limit and must never contain email, product data, price, cookies, credentials, or tokens. Delivery occurs after the surrounding transaction commits. The API listener validates every payload with `packages/schemas`, routes it only to sockets bound to the matching user, removes `userId`, and sends the client `{ v, type, entityId }` invalidation. PostgreSQL notifications are not durable; Section 8 defines reconnect healing.

### 6.5 Monitor-owned scheduled maintenance

Database-extension scheduling is not used. The monitor checks the following UTC jobs once per minute and on startup. In one transaction it acquires a stable transaction-scoped `pg_try_advisory_xact_lock` per job, reads `maintenance_job_state`, runs an overdue job, and records completion only after success. Do not use session-level advisory locks over the pooled runtime connection. Queries are idempotent, so a restart or retry is safe:

```text
09:15 UTC daily  purge-deleted-alerts    DELETE alerts older than 7 days by deleted_at
09:30 UTC daily  purge-old-observations  DELETE offer_observations older than 30 days
09:45 UTC daily  purge-old-events        DELETE recent_events older than 60 days
hourly           purge-realtime-tickets  DELETE consumed or expired realtime_tickets
```

The monitor remains one replica in V1. Advisory locks make maintenance safe if a second replica is introduced accidentally, but do not authorize horizontally scaling retailer polling.

### 6.6 Seed (`packages/db/src/seed.ts`)

Products from the mockups, cents, first four suggested in this rank order:

```text
prismatic-evolutions-etb    Prismatic Evolutions Elite Trainer Box     5499  suggested 1
destined-rivals-etb         Destined Rivals Elite Trainer Box          5499  suggested 2
151-booster-bundle          151 Booster Bundle                         2999  suggested 3
journey-together-etb        Journey Together ETB                       4999  suggested 4
charizard-ex-premium        Charizard ex Premium Collection            7999
charizard-ex-super-premium  Charizard ex Super-Premium Collection      8999
charizard-ex-ultra-premium  Charizard ex Ultra-Premium Collection     11999
charizard-ex-special        Charizard ex Special Collection            3999
```

Use placeholder `retailer_product_id` and `product_url` values (real TCINs and page URLs land in Milestone 9). Set `poll_interval_seconds = 15` on the four suggested products and 60 elsewhere: hyped drops are typically decided within the first 90 seconds, so hot products need fast polling. Also seed one row per product in `fake_offers` with `purchasable=false`.

## 7. Domain rules and the monitor service

### 7.1 Money (packages/domain/money.ts)

```ts
export type Cents = number; // integer
export function parseDollarsToCents(input: string): Cents | null {
  const m = input.replace(/[$,\s]/g, '').match(/^(\d{1,4})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}
export function formatCents(c: Cents): string {
  return `$${(c / 100).toFixed(2)}`;
}
```
Valid alert range: 100 to 999999 cents (mirrors DB checks; Zod enforces client-side; "Enter a valid price." on failure, Save disabled).

### 7.2 The alert condition (unchanged from spec, restated precisely)

An alert is eligible when the latest observation for its product has `purchasable = true` AND `best_price_cents <= price_threshold_cents`.

Definitions, exact:
- `best_price_cents` = the lowest ITEM price in USD cents among qualifying offers, excluding shipping and tax. V1 does not model shipping cost; if a source only exposes an item-plus-shipping total, record the item price when separable, otherwise skip that offer.
- `purchasable` (a qualifying offer) = orderable on Target.com right now for shipment to a contiguous-US address. Marketplace (third-party) sellers count. In-store-only, store-pickup-only, preorder-closed, and "sold out" listings do not count.
- Availability means the source's national online-shipping signal. V1 never performs user-specific or ZIP-specific availability checks. If a chosen source requires a ZIP or reference location to answer online availability, STOP at M2.5/M9 and have the human define the reference-location policy before implementation.
- Stock transitions are irrelevant; only the current state matters.

### 7.3 Trigger state machine (packages/domain/eligibility.ts, pure function + tests)

The confirmation gate lives INSIDE decide(). An eligible-but-unconfirmed poll must not disarm the alert; putting the gate outside decide() would disarm without firing and the alert would never trigger.

```ts
type Decision = { fire: boolean; nextArmed: boolean };
export function decide(input: {
  eligible: boolean;            // 7.2 against latest observation
  status: 'active' | 'paused';
  armed: boolean;
  consecutiveEligible: number;  // AFTER this poll's increment/reset
  confirmObservations: number;  // products.confirm_observations
  lastTriggeredAt: Date | null;
  now: Date;
  cooldownMinutes: number;      // constants.MIN_RETRIGGER_MINUTES = 30
}): Decision {
  if (!input.eligible) return { fire: false, nextArmed: true };      // re-arm on any ineligible poll
  if (input.status === 'paused') return { fire: false, nextArmed: input.armed };
  const confirmed = input.consecutiveEligible >= input.confirmObservations;
  const cooled = !input.lastTriggeredAt ||
    input.now.getTime() - input.lastTriggeredAt.getTime() >= input.cooldownMinutes * 60_000;
  if (input.armed && confirmed && cooled) return { fire: true, nextArmed: false };
  return { fire: false, nextArmed: input.armed };                     // unconfirmed or cooling: stay armed
}
```
Combined with the DB re-arm trigger (6.2), this yields: fires once when a qualifying offer appears and survives the confirmation count; will not fire again until the product goes ineligible and comes back (streak resets to 0 in the loop, cooldown still applies) or the user edits price/status (streak AND cooldown reset, D22); creating an alert on an already-eligible product fires within `confirm_observations` poll intervals. When `fire` is true, `fire_alert` (6.2) re-checks armed and cooldown under a row lock and performs the disarm atomically (D23); `decide()` only avoids useless database calls and never writes state on the fire path.

### 7.4 Monitor loop (apps/monitor)

```text
every MONITOR_TICK_SECONDS (default 15):
  if monitor_source_state[OFFER_SOURCE].backoff_until > now: skip this tick   -- source-wide breaker
  due = products where is_active
        and (backoff_until is null or backoff_until <= now)          -- monitor_product_state
        and (last_polled_at is null or now - last_polled_at >= poll_interval_seconds)
  { snapshots, failures } = source.fetchMany(due)     -- adapters own concurrency (7.5)
  per product in snapshots:
    upsert monitor_product_state (last_polled_at=now, consecutive_errors=0, backoff_until=null)
    insert offer_observations row
    load alerts (deleted_at is null, join alert_trigger_state, join products.confirm_observations)
    per alert:
      eligible ? consecutive_eligible += 1 : consecutive_eligible = 0
      decision = decide() from 7.3
      if decision.fire:
        trigger_key = snapshot.observed_at ISO string
        select fire_alert(alert_id, trigger_key, best_price_cents, MIN_RETRIGGER_MINUTES)
        -- authority + disarm + delivery outbox live inside fire_alert (D23); a null
        -- return (lost race, cooling, already fired) changes nothing
      else: persist nextArmed + consecutive_eligible if changed
  per product in failures:
    if failure.kind in ('parse','transport'):            -- product-specific
      upsert monitor_product_state (consecutive_errors += 1,
        backoff_until = now + least(30s * 2^(consecutive_errors - 1), 15 min))   -- 30s, 60s, ... cap 15 min
    log and skip product this cycle
  if any failure.kind in ('retailer_reject','source_unavailable'):   -- retailer-wide, ONCE per cycle
    upsert monitor_source_state (consecutive_errors += 1,
      backoff_until = now + least(SOURCE_BACKOFF_BASE_MS * 2^(n-1), SOURCE_BACKOFF_CAP_MS))
  else if no failures at all:
    reset monitor_source_state.consecutive_errors = 0, backoff_until = null
```
Idempotency: `fire_alert` (6.2) makes the event insert, the disarm, and the delivery outbox one transaction, keyed on `(alert_id, trigger_key)`, so crash-retries can neither duplicate an event, disarm without an event, nor lose a push. Single process; no queue infrastructure in V1. Expose `GET /healthz` on a tiny HTTP listener for the deploy platform. Graceful SIGTERM: finish current cycle, exit.

### 7.5 OfferSource interface + fake source (the key dev unblock)

```ts
export interface OfferSnapshot {
  productId: string; observedAt: string;
  purchasable: boolean; bestPriceCents: number | null; raw?: unknown;
}
export interface OfferSourceFailure { productId: string; error: string; kind: 'transport' | 'retailer_reject' | 'parse' | 'source_unavailable' }
export interface OfferSource {
  // Batch-first so a commercial feed (M9) can use native bulk lookup without an
  // interface change, which matters because M9 may only touch the adapter dir.
  // Adapters own their internal concurrency; partial failures are returned per
  // product so the loop can drive the per-product circuit breaker.
  fetchMany(products: { id: string; retailerProductId: string }[]):
    Promise<{ snapshots: OfferSnapshot[]; failures: OfferSourceFailure[] }>;
}
```
Adapter contract for `fetchMany`: every requested product must appear EXACTLY ONCE across `snapshots` or `failures` (never both, never missing). Any snapshot with `purchasable = true` must carry a non-null, positive integer `bestPriceCents`; `purchasable = false` sets `bestPriceCents = null`. `raw` must never contain proxy credentials, authorization headers, or cookies (7.9). `FakeOfferSource` resolves the whole due set with one query over `fake_offers`. Ship a CLI in apps/monitor:

```text
pnpm --filter monitor inject --slug prismatic-evolutions-etb --price 52.99
pnpm --filter monitor inject --slug prismatic-evolutions-etb --gone
```
`--price` sets purchasable=true at that price; `--gone` sets purchasable=false. This drives the entire pipeline (event creation, realtime, push, Recent UI) with zero Target code. Every milestone demo uses it.

### 7.6 Real sources (Milestone 9 only; human approval required first; D19)

Two implementations behind the same `OfferSource` interface, evaluated in this order:

1. `FeedOfferSource`: a licensed commercial retail stock and price data feed. At M9 the agent researches current vendors covering Target online availability and price, presents options with cost, latency, and coverage, and the human picks. Buying data avoids the anti-bot fight entirely where a vendor covers the need.
2. `TargetOfferSource`: own adapter. Target has no public product API; its site clients call internal endpoints, and scraping or automating them may violate Target's terms of service, will meet anti-bot friction, and breaks without notice. If built: strictly behind `OfferSource`, internal concurrency limit of 3 with jitter, one in-call retry, low request rates, circuit breaker on repeated failures via monitor_product_state, all requests through `ProxyPool` per the 7.9 failover contract, adapter treated as disposable. `FeedOfferSource` typically needs no proxies.

Scope: US retailers only in V1 (matches Guppy). Nothing outside these adapter files may know how offers are fetched. All prior milestones run on the fake source.

### 7.7 Push dispatch (mobile only; desktop is D8)

Rows in `notification_deliveries` are created only by `fire_alert` (6.2). The dispatcher just drains them:

```text
dispatcher loop (same process as the monitor, every 10s):
  batch = notification_deliveries where status = 'pending'
                                    and next_attempt_at <= now()
          join recent_events e   on e.id = event_id
          join products p        on p.id = e.product_id
          join user_preferences up on up.user_id = e.user_id
          order by (up.plan: plus 0, basic 1, free 2), e.occurred_at   -- D17, a sort not a delay
  send via expo-server-sdk in chunks
  per delivery on success: status = sent, store ticket id
  per delivery on send failure (timeout, DNS, network, Expo 5xx):
    attempt_count += 1, last_error = message
    if attempt_count >= PUSH_MAX_ATTEMPTS (5): status = failed
    else next_attempt_at = now + PUSH_RETRY_DELAYS_MS[attempt_count - 1]
         -- delays: 30s, 2m, 10m, 30m (constants); attempt 1 was immediate
receipt job every 5 min resolves tickets:
  DeviceNotRegistered -> delete that push_token, mark delivery receipt_error
payload: title = p.name
         body  = `${formatCents(e.price_cents)} at Target`
         data  = { eventId: e.id, url: `notifyapp://recent/${e.id}` }
```

`notifications_enabled` was checked at enqueue time inside `fire_alert`; a user toggling it off between enqueue and send may still receive that in-flight push, which is accepted. A monitor crash after firing can never lose a push: the pending rows survive and are sent on restart.

### 7.8 Catalog management CLI (apps/monitor)

The catalog changes through these commands using the `notify_monitor` role, never through hand edits of the hosted DB:

```text
pnpm --filter monitor catalog:add    --slug x --name "..." --tcin 12345678 --price 54.99 --url https://www.target.com/p/...
pnpm --filter monitor catalog:update --slug x [--price] [--url] [--image] [--poll 15] [--confirm 2] [--suggested 3]
pnpm --filter monitor catalog:retire --slug x        # sets is_active=false; alerts stay, monitoring stops
```

`--image` accepts only an HTTPS URL whose exact hostname is in `packages/config` `PRODUCT_IMAGE_HOSTS`; when the list is empty, it rejects every remote image and `image_url` remains null. The apps render the neutral placeholder required by `docs/assets/README.md` for null images.

### 7.9 ProxyPool and proxy CLI (apps/monitor; used only by TargetOfferSource)

Central checker, developer-operated (D1, D24). Proxies live entirely inside the monitor; no client ever sees a group, an endpoint, or a credential.

Encryption: decode `PROXY_ENC_KEY` from base64 and reject it unless it is exactly 32 bytes. Derive two 32-byte subkeys with HKDF-SHA256 (`node:crypto`) using the fixed UTF-8 salt `notify-proxy-hkdf-salt-v1`: info `proxy-encryption-v1` for AES-256-GCM and info `proxy-fingerprint-v1` for the HMAC. Encrypt each `username` and `password` independently with a fresh cryptographically random 12-byte nonce and a 16-byte GCM authentication tag. Authenticate the UTF-8 field label `notify-proxy-credential-v1:username` or `notify-proxy-credential-v1:password` as AES-GCM AAD. Store standard base64 of the exact byte sequence `nonce || ciphertext || tag`, prefixed as `v1:<base64>`. Decryption rejects an unknown version, malformed base64, a payload shorter than 28 bytes, or authentication failure. Dedup uses `username_fp = base64(hmac-sha256(fp_subkey, trimmed exact-case username))` (usernames are NOT lowercased) so the unique index works over non-deterministic ciphertext. Decryption happens only in monitor memory when acquiring an endpoint.

Interface:

```ts
export interface ProxyEndpoint {          // decrypted, in-memory only
  id: string; protocol: 'http'|'https'|'socks5';
  host: string; port: number; username?: string; password?: string;
}
export interface ProxyPool {
  acquire(groupName: string): Promise<ProxyEndpoint | null>;  // healthy + not cooling; null if none
  reportSuccess(id: string): Promise<void>;
  reportFailure(id: string): Promise<void>;                   // TRANSPORT failures only
}
```

Selection: among endpoints where `enabled` and (`cooldown_until is null` or `< now()`) and NOT currently leased, pick the one with the oldest `last_success_at` (nulls first) for even spread. `acquire()` adds the endpoint to an in-memory `inUse` set before returning; `reportSuccess`/`reportFailure` remove it, and the adapter wraps each request in `try/finally` so an unexpected throw still releases the lease. This prevents concurrency 3 from leasing the same "oldest" endpoint three times in one tick. The `inUse` set is process-local (the monitor is single-process, M8); no distributed locking. Return null when the group is empty or every endpoint is cooling or leased.

Transport: the adapter issues requests with `axios`, choosing an agent by `protocol`: `http`/`https` -> `https-proxy-agent`, `socks5` -> `socks-proxy-agent`. Encryption, HKDF subkey derivation, and the HMAC fingerprint all use `node:crypto`; no crypto or proxy dependency beyond the two named agents and axios (Section 3).

Health state (pure function `proxyNext()` in `proxy/health.ts`, unit-tested):
- success -> `consecutive_failures = 0`, `cooldown_until = null`, `last_success_at = now`.
- transport failure -> `consecutive_failures += 1`, `last_failure_at = now`, `cooldown_until = now + min(30s * 2^(consecutive_failures - 1), 15 min)`.

Failover contract inside `TargetOfferSource` (the ONLY caller). It maps each product to exactly one `snapshots`/`failures` entry (7.5) and classifies failures into the three `kind`s the loop branches on (7.4):

```text
group = monitor_source_config[source='target'].proxy_group_id  (name resolved once per fetchMany)
sourceRejecting = false
for each product in the batch:
  if sourceRejecting: record failure {kind:'retailer_reject'} without a request; continue  # drain remainder cheaply
  attempts = 0
  loop while attempts < min(healthy_count, PROXY_MAX_ATTEMPTS):
    p = pool.acquire(group)
    if p is null:                         # pool dry: infrastructure, not a product problem
      record failure {kind:'source_unavailable'}; break
    try request through p
      on transport failure (connect refused, proxy auth fail, tunnel fail, DNS, timeout):
        pool.reportFailure(p.id); attempts += 1; continue          # rotate to next proxy
      on reaching Target (any HTTP status):
        pool.reportSuccess(p.id)          # the PROXY worked even if Target says 403/429/5xx
        if 403/429/5xx/challenge: record failure {kind:'retailer_reject'}; sourceRejecting = true; break
        else if body will not parse for THIS product: record failure {kind:'parse'}; break
        else: record snapshot; break
```

Then in the loop (7.4): any `retailer_reject` OR `source_unavailable` in the batch trips `monitor_source_state` ONCE for the cycle (not once per product) and pauses the whole source; `parse` and `transport` stay product-specific in `monitor_product_state`. `source_unavailable` uses the same source backoff so Target is not retried until the pool can plausibly serve it again.

The rule that retailer rejection marks the proxy as a success and stops rotation is deliberate: it keeps "proxy broke" and "retailer throttled/blocked" as two separate error classes, and it prevents proxy rotation from being used to walk around Target's rate limits or anti-bot controls (rotation is resilience against dead proxies, nothing more). A wave of retailer rejections across products trips the source-wide breaker (`monitor_source_state`, 7.4), pausing the whole source rather than hammering it product by product.

Log and snapshot hygiene (extends rule 13): log lines may contain `proxy_endpoint_id`, host, port, and HTTP status, but never username, password, authorization headers, full proxy URLs, encryption plaintext, or decrypted `ProxyEndpoint` objects. Catch-and-rethrow around proxy requests must strip any credential the transport library may embed in an error message. `OfferSnapshot.raw` must never carry proxy credentials, request auth headers, or cookies.

Proxy CLI (`notify_monitor` role; built in M2 as monitor infrastructure, exercised for real at M9):

```text
pnpm --filter monitor proxy:import --group <name> --file <path> [--mode merge|replace]   # default merge
pnpm --filter monitor proxy:groups                          # groups with counts
pnpm --filter monitor proxy:list   --group <name>           # endpoints (credentials masked)
pnpm --filter monitor proxy:test   --group <name>           # checks each endpoint via PROXY_HEALTHCHECK_URL only
pnpm --filter monitor proxy:use    --source target --group <name>   # writes monitor_source_config
```

Import is idempotent (dedup on protocol+host+port+username_fp) and reports counts:

```text
Importing target-main (merge)...
Parsed:      100
Imported:     98
Duplicates:    1
Invalid:       1
target-main now has 98 proxies.
```

`--mode replace` parses and validates the ENTIRE file first, then deletes existing endpoints and inserts the new set in one transaction, so a malformed file or crash cannot wipe a working group; `merge` (default) adds only new ones. `proxy:test` requests `PROXY_HEALTHCHECK_URL` (a neutral IP-echo, never Target) through each endpoint and reports healthy/failed; it does not touch any retailer and is safe before M9.

Parser (`proxy/parse.ts`, unit-tested; uses `csv-parse` for CSV, an approved M2 dependency, so quoting/embedded commas are handled correctly). Auto-detect per line for TXT; header-or-single-field for CSV:

```text
TXT forms:
  host:port
  host:port:username:password
  username:password@host:port
  {http|https|socks5}://[username:password@]host:port
CSV forms:
  columns host,port[,username,password,protocol]
  or a single column holding host:port[:username:password]
Default protocol when unspecified: http. Lines that match nothing count as Invalid (never dropped silently).
```

## 8. Realtime and cross-device sync

- `POST /v1/realtime-ticket` requires a valid Better Auth session. In one transaction it deletes stale tickets for the user, creates 32 random bytes, stores only `sha256(ticket)` with a 60-second expiry, and returns the base64url plaintext once. Tickets are single-use; the WebSocket upgrade atomically marks one consumed and rejects expired, consumed, unknown, or malformed values.
- The client opens `GET /v1/realtime` and offers subprotocols `notify-v1` and `ticket.<base64url-ticket>`. The API accepts only `notify-v1` in the response, never echoes the ticket subprotocol, and binds the socket to the consumed ticket's user. Tickets, cookies, and session tokens are redacted from logs.
- Each API replica holds one dedicated direct PostgreSQL connection for `LISTEN notify_realtime`; ordinary Fastify/Drizzle queries use `DATABASE_URL`. Neon transaction pooling does not support `LISTEN`, so `DATABASE_DIRECT_URL` must not use a `-pooler` host in hosted environments.
- The API validates notification payloads and sends `{v:1,type,entityId}` only to sockets for the matching user. Clients validate this versioned Zod message and invalidate the matching TanStack Query keys from Section 9.3; they never perform manual cache surgery from payload contents.
- Reconnect uses capped exponential backoff with jitter. After every successful initial connection or reconnection, clients invalidate `alerts`, `recent`, and `preferences` once before relying on new messages. This heals every event missed while disconnected.
- The API sends a WebSocket ping every 30 seconds and terminates sockets that do not answer by the next interval. A socket has a maximum lifetime of 15 minutes; the server closes it and the client obtains a new ticket, which re-verifies the Better Auth session. Sign-out closes the socket immediately. Clients send no application messages after connection establishment.
- Electron main owns the desktop socket so it remains active while the window is hidden. The renderer receives only validated cache-invalidation messages through a narrow preload callback. Mobile owns its socket while the app is active; Expo push is the background delivery path.
- The listener reconnects and issues `LISTEN notify_realtime` again after any database disconnect. `/healthz` reports unhealthy if the HTTP service cannot query PostgreSQL; `/readyz` additionally reports unready until the listener is subscribed.

## 9. Shared client architecture (packages/data, packages/config)

### 9.1 REST API and repositories

All customer data routes are under `/v1`; Better Auth owns `/api/auth`. Every `/v1` route declares Zod schemas for params, query, body, success response, and error response. Fastify validates requests and serializes responses from those schemas. Generate OpenAPI in a deterministic root script, then generate `packages/api-client` with `openapi-typescript`; its runtime transport is `openapi-fetch`. CI fails if regeneration changes checked-in output.

Canonical routes:

```text
GET    /v1/products?scope=all|suggested
GET    /v1/products/:productId
GET    /v1/alerts
GET    /v1/alerts/:alertId
POST   /v1/alerts
PATCH  /v1/alerts/:alertId
DELETE /v1/alerts                 body: { ids: uuid[] }
POST   /v1/alerts/restore         body: { ids: uuid[] }
GET    /v1/recent?days=14&limit=50&cursor=<opaque>
GET    /v1/recent/:eventId
GET    /v1/preferences
PATCH  /v1/preferences
PUT    /v1/push-tokens            body: { token, platform: 'ios'|'android' }
DELETE /v1/push-tokens            body: { token }
POST   /v1/realtime-ticket
GET    /v1/realtime               WebSocket upgrade
GET    /healthz
GET    /readyz
```

Canonical customer DTOs use camelCase, UUID strings, ISO-8601 UTC timestamps, and integer cents. They never expose `userId`, database credentials, auth tokens, trigger state, source state, raw observations, proxy data, or delivery rows:

```ts
type ProductDto = {
  id: string; slug: string; name: string; imageUrl: string | null;
  productUrl: string | null; retailer: 'target';
  defaultAlertPriceCents: number; isActive: boolean;
};
type ProductSummaryDto = Pick<ProductDto,
  'id' | 'slug' | 'name' | 'imageUrl' | 'productUrl' | 'retailer' | 'isActive'>;
type AlertDto = {
  id: string; product: ProductSummaryDto; priceThresholdCents: number;
  status: 'active' | 'paused'; createdAt: string; updatedAt: string;
};
type RecentEventDto = {
  id: string; type: string; priceCents: number; retailer: 'target';
  occurredAt: string; product: ProductSummaryDto;
};
type PreferencesDto = { notificationsEnabled: boolean };
```

List responses are `{ items }`, except Recent, which is `{ items, nextCursor }`. Single-resource reads and mutations return `{ item }`; delete/restore return `{ deletedIds }` / `{ restoredIds }`; push-token mutations return `{ ok: true }`; realtime-ticket returns `{ ticket, expiresAt }`. Customer DTOs never expose `user_preferences.plan`; it is monitor/internal dispatch data only. Error codes are the stable union `unauthorized | forbidden | not_found | validation | conflict | alert_limit_reached | rate_limited | internal`, and each maps to the repository taxonomy in 9.2 without leaking internal messages.

All authenticated handlers call Better Auth session verification before any domain query. Products require authentication in V1. Recent uses stable keyset pagination ordered by `(occurred_at desc, id desc)`, with an opaque base64url cursor and `limit` constrained to 1–100; `packages/data` exposes it as an infinite query while preserving the 14-day boundary. The API returns stable error envelopes `{ error: { code, message } }`; it never returns database messages, stack traces, credentials, or arbitrary Drizzle rows. Request IDs are logged, but auth headers, cookies, ticket values, push tokens, proxy data, and query parameters containing secrets are redacted. Swagger UI is available in development only; production does not expose interactive API documentation.

For all state-changing `/v1` routes, require `Content-Type: application/json`, the expected `X-Notify-Client` header, and an exact allowed Origin when an Origin is present. CORS permits credentials only for exact configured origins; production never uses a wildcard. Fastify's global request-body limit is 64 KiB; individual array/string limits remain tighter in Zod. Rate-limit realtime-ticket issuance to 10 attempts per user per minute and other mutation routes to 120 requests per user/IP per minute. Return 429 with the stable error envelope.

`packages/data` has two generated-client transports. Electron main obtains the protected cookie through the official Better Auth Electron client, attaches it explicitly, sets `credentials: 'omit'`, and exposes only typed results over narrow IPC. Expo obtains the cookie from the official Better Auth Expo client, attaches it explicitly, and also sets `credentials: 'omit'`; `include` must not be used because it can interfere with the manually supplied native Cookie header. Both transports set the correct `X-Notify-Client` value (`desktop` or `mobile`). Renderer/screens never receive, log, or construct Cookie headers.

```ts
ProductRepository:  listAll(); listSuggested(); getById(id)
AlertRepository:    list(); getById(id); create({productId, priceThresholdCents});
                    updatePrice(id, cents); setStatus(id, 'active'|'paused');
                    softDelete(ids: string[]); restore(ids: string[])
                    CONTRACT: list() and getById() ALWAYS filter deleted_at is null
                    (the API can access soft-deleted rows, so the filter lives in its
                    repository). softDelete() and restore() are the only
                    methods that touch deleted rows; no read path may return them.
RecentRepository:   listLast14Days(); getById(eventId)   // joined with product name/image
PreferencesRepository: get(); setNotificationsEnabled(boolean)
PushTokenRepository (mobile only): register(token, platform); unregister(token)
AuthRepository:     signIn(email, pw); signUp(email, pw); signOut(); onSessionChange(cb)
```
Domain implementations in `packages/data` wrap only the generated API client. `AuthRepository` wraps the official Better Auth client for the current platform; it never exposes session material. Server query modules in `apps/api` use `packages/db`; neither server code nor Drizzle is imported by customer bundles. Reads select only response fields. Product list routes filter `is_active = true`; the product-detail route may return retired products so the "no longer available" state, alert rows, and Recent detail keep rendering after retirement. Alert creation/deletion/restoration follows the locked Drizzle transactions in 6.2 with the verified session user ID. Restore invalidates `['alerts']` and returns only restored IDs; IDs skipped because the user reached 50 or recreated the same product during the undo window are silently omitted as already specified.

### 9.2 Error taxonomy

Every repository call rejects with `RepoError { code: 'offline' | 'network' | 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'alert_limit_reached' | 'rate_limited' | 'unknown' }`. An `unauthorized` response clears local session state and routes to `/login`; `not_found` renders the resource's unavailable/back state; `offline` renders the offline screen; `network`, `forbidden`, `rate_limited`, and `unknown` on loads render "Couldn't load content." + Try Again. Mutation failures use the exact per-mutation strings in 9.5 and preserve user input. Do not surface backend error messages directly.

### 9.3 TanStack Query keys and mutations

```ts
['products','all']  ['products','suggested']  ['products', id]
['alerts']          ['recent']                ['recent', eventId]
['preferences']
```
Mutations (toasts render through the global ToastHost: exactly one toast visible, a newer toast replaces the current one, success toasts 3000 ms, undo toasts 6000 ms with the action; success toasts sit top-right of the content area on desktop and top of screen on mobile, undo toasts sit at the bottom of the content area on desktop and above the tab bar on mobile, matching the mockups):
- createAlert: server-confirmed -> toast "Alert created" -> invalidate `['alerts']`. If the API returns `alert_limit_reached`, remain on the current Home, Browse, or Product Details screen, preserve its state, show "You can monitor up to 50 products.", and do not render a success toast or an Alert Set state. This limit state has no Try Again action; the user must remove an alert before creating another.
- updateAlertPrice: server-confirmed -> back to Alerts -> toast "Alert updated".
- setStatus: optimistic flip, rollback + silent refetch on error (no dialogs, per spec).
- softDelete / bulk: server-confirmed -> remove rows -> undo toast ("Alert deleted" / "N alerts deleted"); Undo calls `restore(ids)`.

### 9.4 Routes and deep links (packages/config/routes.ts)

```text
/home  /browse  /products/:productId
/alerts  /alerts/:alertId/edit
/recent  /recent/:eventId
/account  /account/notifications
Deep link scheme (both platforms): notifyapp://recent/:eventId
```

### 9.5 Strings (packages/config/strings.ts, verbatim from mockups)

"Alert created" · "Alert updated" · "Alert deleted" · "2 alerts deleted" (templated N) · "Undo" · "Enter a valid price." · "Couldn't create alert." · "You can monitor up to 50 products." · "Couldn't save changes." · "Couldn't delete alert." · "Couldn't load content." · "Couldn't load suggestions." · "Couldn't load products." · "Couldn't load recent activity." · "You're offline." · "Check your connection and try again." · "Try Again" · "No products found." · "Try a different search." · "No alerts yet." · "Start monitoring products you care about." · "Browse Products" · "No alerts in the last 14 days." · "Notifications are off. You may miss alerts." · "Turn On" · "Notify me when available at" · "or less" · "Alert Me" · "Alert Set" · "Saving..." · "Select" · "Select All" · "Cancel" · "Last 14 Days" · "Open at Target"

### 9.6 Screen-to-data map (build every state listed; this is the whole V1 surface)

| Screen | Route | Reads | Writes | States |
|---|---|---|---|---|
| Home | /home | products.suggested; alerts (for Alert Set) | createAlert | default, alert-set cards, creating (button disabled), created toast, alert-limit failure, notifications-off banner, skeleton, load failure |
| Browse | /browse | products.all; alerts | createAlert | default list, active search, no results, alert-set rows, created toast, alert-limit failure, skeleton, load failure |
| Product Details | /products/:id | product; alerts | createAlert | default, creating, created toast, already alerted, create failure including the alert-limit state (stay on screen), product retired (`is_active=false`: "no longer available" + Back); secondary "Open at Target" external link (D16) |
| Alerts | /alerts | alerts | setStatus; softDelete; bulk | default rows (image, one-line name with ellipsis, price never truncates, toggle), paused, empty (LOCKED: heading "No alerts yet.", subtext "Start monitoring products you care about.", and a "Browse Products" button routing to /browse; the CTA is intended first-run guidance and is shown in `docs/mockups/desktop/alerts-core-and-edit-entry.png` and `docs/mockups/mobile/alerts-core-and-edit-entry.png`, so the management-only rule applies to the POPULATED list, not this state), select mode (toggles hidden, Select All, Delete N, Cancel), single/bulk undo toasts, delete failure (row restored) |
| Edit Alert | /alerts/:id/edit | alert | updatePrice | default, invalid (Save disabled), saving, updated toast + back, failure (input preserved) |
| Recent | /recent | recent 14 d | none | grouped Today/Yesterday/date (local tz, client-side), empty, skeleton, load failure |
| Recent Detail | /recent/:eventId | event + product | none | default with primary "Open at Target" button opening `product_url` externally (D16; deliberate override of the original spec's no-action rule) |
| Account | /account | none | signOut | static links (external URLs from config), Log Out |
| Notifications | /account/notifications | preferences + OS permission | setNotificationsEnabled | on, OS-disabled (Open Settings); the toggle is account-wide across desktop and mobile (D21) |
| Auth (minimal) | /login | none | signIn/signUp | form, error |

Global reusable components: skeleton loader, network-failure panel, offline panel, toast host, banner. Notifications banner logic: mobile shows it when OS permission is denied or undetermined (expo-notifications `getPermissionsAsync`); desktop shows it when the in-app toggle is off or `Notification.isSupported()` is false (macOS gives Electron no reliable permission read; note this in code). "Open Settings": mobile `Linking.openSettings()`; desktop `shell.openExternal` to `x-apple.systempreferences:com.apple.preference.notifications` (mac) / `ms-settings:notifications` (win).

## 10. Desktop app (apps/desktop)

### 10.1 Scaffold and security
electron-vite template (main + preload + renderer). BrowserWindow webPreferences: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Single-instance lock. On Windows, call `app.setAppUserModelId()` with the same human-approved reverse-DNS desktop application ID used by electron-builder (required for notifications); do not invent a temporary production identity.

Layer contract, non-negotiable:

```text
Renderer   React only. No Node APIs, no filesystem, no direct Electron imports, no secrets.
           Loads only bundled local content; webSecurity stays true. Strict CSP:
             default-src 'self'; connect-src 'self' plus the exact Sentry ingest origin
             approved at M8; img-src 'self' data: plus exact hosts in
             config PRODUCT_IMAGE_HOSTS; no remote script, style, or font origins.
Preload    Exposes ONLY the methods in 10.2. Never ipcRenderer, never generic channels.
Main       Validates every preload payload with Zod before acting.
           Every ipcMain handler validates that event.sender is the main window's
             webContents and event.senderFrame URL is the expected local renderer
             origin before reading a payload or returning data.
           setWindowOpenHandler denies all window.open; will-navigate blocks any
             navigation off the app origin. External URLs travel exclusively
             through validated openExternal().
           openExternal: allow only https: URLs whose host is www.target.com, target.com,
             or a host listed in config EXTERNAL_HOSTS (support/legal pages). Reject the rest.
           Deep links: accept only notifyapp://recent/<uuid v4>; anything else is ignored
             and logged. IDs are validated before navigation is forwarded to the renderer.
           Do not use <webview>. Install permission-check and permission-request
             handlers that deny every renderer permission; V1 native notifications
             are created in main and require no renderer permission grant.
```

At M8, harden packaged binaries with `@electron/fuses` during the packaging
hook after pack and before code signing/notarization: disable `RunAsNode`,
`EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments`; enable
`EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation`, and
`OnlyLoadAppFromAsar`. Test the signed packaged build after flipping the fuses.

### 10.2 Preload API (narrow, typed; never expose raw ipc)
```ts
window.desktop = {
  app:  { version(): Promise<string>; openExternal(url: string): Promise<void> },
  auth: { signIn(email: string, password: string): Promise<PublicUser>;
          signUp(email: string, password: string): Promise<PublicUser>;
          signOut(): Promise<void>; getUser(): Promise<PublicUser | null> },
  notifications: { openSettings(): Promise<void> },
  onAuthChanged(cb: (user: PublicUser | null) => void): () => void,
  onRealtimeInvalidation(cb: (event: RealtimeInvalidation) => void): () => void,
  onDeepLink(cb: (url: string) => void): () => void
}
```

### 10.3 Session handoff
Electron main owns Better Auth through `createAuthClient` plus the official `electronClient` plugin from `@better-auth/electron/client`. Main calls the ordinary `authClient.signIn.email`, `signUp.email`, `signOut`, and session methods; the Electron plugin's fetch hooks capture and attach Better Auth cookies. The plugin requires `signInURL` even though Notify does not use browser authentication; set it to the inert in-app `notifyapp://login` route. Do not call `requestAuth`, `setupMain`, `setupRenderer`, or expose the plugin's stock IPC bridges: Notify owns protocol handling and uses only the narrower API in 10.2.

Supply the plugin a minimal storage adapter backed by a private file under `app.getPath('userData')`. The plugin itself encrypts cookie/session cache values with Electron `safeStorage` before invoking that adapter and falls back to in-memory session storage when OS encryption is unavailable; do not pre-encrypt or persist plaintext session material. Set `disableCache: true` and `userImageProxy.enabled: false`, because V1 needs neither the cached user record nor avatar proxy. Only the named email/password methods and events in 10.2 cross the sandboxed preload. The renderer never receives cookies, session tokens, authorization codes, or the auth client itself; it sees only a Zod-sanitized `PublicUser { id, email }` and typed results. Configure the Electron plugin on the API and `notifyapp:/` as a trusted origin. Email/password is the only V1 provider, so sign-in and sign-up stay in the app's minimal Auth screen; do not add a browser/social-auth flow. Better Auth requires a name on email signup; pass the normalized email address as the internal `name` without adding a V1 name field, and omit it from `PublicUser`.

Authenticated API calls and `/v1/realtime-ticket` originate in main with the Better Auth cookie attached and `credentials: 'omit'`, then cross the preload boundary only as typed repository results and invalidation callbacks. Do not expose a generic fetch, raw Cookie header, generic IPC method, or raw Better Auth bridge to the renderer.

### 10.4 Notifications while the window is closed
Tray icon with Show and Quit; window close hides to tray (real quit via tray or Cmd/Ctrl+Q). Main keeps the authenticated WebSocket from Section 8. On `recent.created`, main fetches `/v1/recent/:eventId`; the API returns not found unless it belongs to the socket's user. Main also fetches preferences, suppresses the native notification when `notifications_enabled` is false, and otherwise raises `new Notification({ title: productName, body: formatCents(priceCents) + ' at Target' })`. Click -> show window -> send `/recent/:id` to renderer through the deep-link callback. Unsigned dev builds on macOS may not display notifications reliably; verify on the packaged build.

### 10.5 Protocol + updates
`app.setAsDefaultProtocolClient('notifyapp')`; handle `open-url` (mac) and `second-instance` argv (win) -> route to renderer. electron-builder configured with GitHub Releases publish from day one; `electron-updater` `checkForUpdatesAndNotify()` on launch, disabled in dev. Known constraint: macOS auto-update requires a signed (and notarized) app; scaffold now, sign before distributing.

## 11. Mobile app (apps/mobile)

- expo-router with a bottom tab navigator for the five tabs; stack screens for product, edit, detail; scheme `notifyapp` in app.json.
- Better Auth uses its official Expo client integration with `expo-secure-store`; it stores cookies/session data securely. The native transport calls `authClient.getCookie()` only inside its private header factory, attaches that value as `Cookie`, and sets `credentials: 'omit'`. The app never exposes, logs, or otherwise reads raw cookie values outside that transport.
- Push reality (D9): create an EAS development build (`expo-dev-client`); push does not work in Expo Go on SDK 53+. Android needs FCM v1 credentials (`google-services.json`) and an explicit notification channel (importance HIGH) created at startup; iOS needs an APNs key via EAS credentials and a paid Apple developer account; test on a physical device.
- Notification permission flow (never auto-request at launch or login):
  undetermined -> Home shows the notifications banner; tapping "Turn On" calls `requestPermissionsAsync()`;
  granted -> register the token through `PUT /v1/push-tokens`, hide the banner;
  denied -> the banner stays and "Turn On" opens OS settings via `Linking.openSettings()`, because iOS never re-prompts after a denial.
- Token registration: on each launch with permission granted, `getExpoPushTokenAsync({ projectId: EXPO_PUBLIC_EAS_PROJECT_ID })` -> `PUT /v1/push-tokens` (also refreshes `last_seen_at`); unregister through `DELETE /v1/push-tokens` on sign-out.
- Notification tap: response listener reads `data.eventId` -> `router.push('/recent/'+eventId)`; cold-start handled via `getLastNotificationResponseAsync`.
- Swipe-to-delete on Alerts rows (mobile only); desktop uses a hover "..." menu + right-click + Delete key, per spec.

## 12. Design tokens and styling posture

`packages/tokens` exports the spec's token names (colors, spacing 4/8/12/16/24/32/48, radius 6/8/12, type scale), informed by `docs/UI_HANDOFF.md` and its referenced boards. Desktop consumes them as CSS variables; mobile as a theme object. Components reference tokens only; visual tuning must not require touching feature code.

## 13. Testing

1. `packages/domain`: Vitest table-driven tests for `decide()` covering at minimum: price below / equal / above threshold; not purchasable; paused (no fire, state preserved); fires once then holds while continuously eligible; re-arms after an ineligible poll and fires again; cooldown blocks a rapid second fire; price edit re-arm behavior; eligible while `consecutiveEligible < confirmObservations` neither fires nor disarms, then fires once the count is reached; money parser edge cases ("$54.99", "54", "0", "10000", "54.999", "abc").
2. `apps/monitor`: integration test against Docker PostgreSQL 17 after the real migration ledger is applied and seeded: inject a fake offer below threshold, run one cycle, assert exactly one `recent_events` row; run a second cycle, assert still one; inject `--gone` then a price again, assert a second event; call `fire_alert` twice with the same key and assert the second call returns null; call it with a price above the alert's current threshold and assert null with armed state untouched. Also test overdue maintenance on startup, idempotent rerun, and advisory-lock exclusion.
3. `apps/api`: Vitest integration suite against Docker PostgreSQL 17, using two real Better Auth test sessions and HTTP requests rather than direct database impersonation. For every user-owned route, prove user B cannot read or mutate user A's alerts, events, preferences, or push tokens. Also prove the plan field cannot be changed through the preferences API; creation rejects retired products; two concurrent creates at 49 alerts leave exactly 50 and the rejected request returns `alert_limit_reached`; restore at the cap cannot produce 51; foreign IDs produce the same not-found envelope as unknown IDs; unauthenticated requests return 401.
4. Realtime integration: mint/consume tickets over HTTP/WebSocket and prove expiry, single use, malformed rejection, cross-user isolation, payload validation, listener reconnection, and full invalidation after reconnect. Start two API instances listening to the same Docker database and prove both receive one committed `NOTIFY`; a rolled-back transaction emits no client event. Assert logs contain no ticket, cookie, push token, or auth header.
5. Contract/security: every route has request and response schemas; OpenAPI generation is deterministic; regenerating `packages/api-client` leaves the worktree clean; response serialization drops undeclared fields. Database-role tests prove `notify_api` cannot execute `fire_alert`, update `alerts.user_id`, update `user_preferences.plan`, or access monitor/proxy tables; `notify_monitor` cannot read Better Auth account/session credential data; neither runtime role can alter schema.
6. Apps: typecheck + lint gates every milestone. One Playwright-driven Electron smoke E2E lands at M8 (see its Done-when); broader UI automation is deferred past V1.
7. `apps/monitor` proxy tests (Vitest): parser accepts every TXT/CSV form in 7.9 and counts unmatched lines as Invalid; encryption round-trips both credential fields and rejects a changed field label, malformed payload, and authentication failure; `proxyNext()` resets on success and sets escalating cooldowns on transport failure and re-eligibility after expiry; the failover harness rotates on a simulated transport error and, on simulated retailer 429 and 503 responses, marks the proxy a success and does NOT rotate; a double import adds zero the second time (idempotency); a batch where every product returns retailer_reject trips monitor_source_state exactly once (not once per product); a batch where the pool is empty yields source_unavailable for each product and trips the source breaker once.

## 14. Milestones (build in this order; stop and verify after each)

Estimates assume an AI coding agent doing the work with a human verifying.

### 14.0 Execution protocol (applies to every milestone)

Before writing any code for a milestone, post a pre-work report:

```text
PRE-WORK: M<N>
Files/dirs I expect to touch:
Acceptance criteria (from Done-when):
Contradictions or missing decisions found:   <list, or "none">
```
If contradictions exist, STOP. If none, begin without asking permission.

Scope per milestone. Touching an off-limits path requires a deviation entry in the completion report. M0 implements the database schema already defined in Section 6 without an additional STOP. Any schema change not defined by Section 6 requires a STOP first (rule 0.2.11).

```text
M0    allowed: packages/db/**, apps/api/package.json, apps/api/tsconfig.json,
      apps/api/src/auth.ts, compose.yaml, root tooling
      off-limits: apps/desktop|mobile|monitor/**, other apps/api/src/**, other packages/**
M1    allowed: packages/domain/**, packages/schemas/**, packages/config/**,
      packages/tokens/**, packages/data/**
      off-limits: apps/**, packages/db|api-client/**
M1.5  allowed: apps/api/**, packages/api-client/**, packages/data/**, packages/schemas/**
      off-limits: apps/desktop|mobile|monitor/**, packages/db/migrations/**
M2    allowed: apps/monitor/**                      off-limits: apps/desktop|mobile|api/**, packages/db/migrations/**
M2.5  allowed: docs/DATA_SOURCE_REPORT.md only      off-limits: all source code
M3    allowed: apps/desktop/**                      off-limits: apps/mobile|monitor|api/**, packages/db/migrations/**
M4    allowed: apps/desktop/**, packages/data/**    off-limits: apps/mobile|monitor|api/**, packages/db/migrations/**
M5    allowed: apps/desktop/**                      off-limits: apps/mobile|monitor|api/**, packages/db/migrations/**
M6    allowed: apps/desktop/**, apps/monitor/**     off-limits: apps/mobile|api/**, packages/db/migrations/**
M7    allowed: apps/mobile/**                       off-limits: apps/desktop|monitor|api/**, packages/db/migrations/**
M8    allowed: apps/**, packages/**, CI, packaging  off-limits: packages/db/migrations/**
M9    allowed: the approved adapter directory under apps/monitor/src/sources/**   off-limits: everything else
```

Global exception: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, and `tsconfig.base.json` at the repo root may change in any milestone, but only as a direct consequence of already-approved dependency or tooling work. That is not a deviation and needs no report entry.

After the Done-when checks pass, STOP, do not begin the next milestone, and post:

```text
MILESTONE COMPLETION REPORT: M<N>
Changed:            <file list>
Commands run:       <pnpm typecheck, pnpm test, ...>
Results:            <pass/fail per command>
Acceptance checks:  <each Done-when item, checked>
Manual verification:<what was demonstrated and how>
Deviations from PLAN.md:  <list, or "none">
Known issues:       <list, or "none">
Next milestone:     M<N+1> NOT STARTED
```
"Done, everything works" is not an acceptable report.

### M0. Repo + PostgreSQL foundation (1 to 2 days)
Before scaffolding, check the current official documentation for Node 24 LTS, Expo SDK 57/React requirements, PostgreSQL 17 support, Neon compatibility/pooling, Drizzle migrations, and Better Auth's Drizzle schema/UUID configuration. STOP and report only if a pinned combination is no longer supported. Scaffold the pnpm/Turborepo root, `compose.yaml` with PostgreSQL 17, `packages/db`, and the minimum `apps/api/src/auth.ts` configuration needed for Better Auth schema generation. Pin exact dependency versions; do not use `@latest` in committed scripts.

Approved M0 dependencies: `drizzle-orm`, `drizzle-kit`, `postgres`, `better-auth`, the pinned `auth` schema CLI, `@better-auth/drizzle-adapter`, `@better-auth/electron`, `@better-auth/expo`, `zod`, `vitest`, `eslint`, `typescript-eslint`, TypeScript, pnpm, and Turborepo. Docker Compose is local infrastructure, not an application dependency.

Create all Better Auth and domain tables, indexes, constraints, functions, triggers, grants, and seeds from Section 6 in the single Drizzle migration ledger. Environment role and pgcrypto provisioning is an idempotent bootstrap step before migrations: Docker initialization creates local roles and hardens the extension privileges from Section 6.3, while the equivalent hosted provisioning occurs at M8 without embedding passwords in migrations. Use Docker health checks and root scripts `db:up`, `db:down`, `db:migrate`, `db:seed`, and `db:reset`; `db:reset` is local/test-only and must reject a non-local database host. No hosted Neon project is required to complete M0.

Done when: a clean `pnpm db:up && pnpm db:reset` applies every migration and seed; a second migration run is a no-op; all expected tables/functions/triggers exist; Better Auth schema generation matches the checked-in Drizzle schema; the database-role subset of 13.5 passes; seed products are visible through a server-only query; `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. Then STOP.

### M1. Shared packages (2 to 3 h)
Build `domain` (money, eligibility, date grouping), `schemas` (REST DTOs, error envelope, realtime event), `config` (routes, strings, constants), `tokens`, and repository interfaces in `data`. Constants include `MIN_RETRIGGER_MINUTES=30`, `SEARCH_DEBOUNCE_MS=150`, `SUCCESS_TOAST_MS=3000`, `UNDO_WINDOW_MS=6000`, `MAX_ALERTS=50`, `WS_RECONNECT_DELAYS_MS=[1000,2000,5000,10000,30000]`, `WS_RECONNECT_JITTER_RATIO=0.2`, `EXTERNAL_HOSTS=[]`, `PRODUCT_IMAGE_HOSTS=[]`, `PUSH_MAX_ATTEMPTS=5`, and `PUSH_RETRY_DELAYS_MS=[30000,120000,600000,1800000]`; both host lists stay empty until the human approves M8 values. The confirmation count remains per-product data, not a constant. Do not implement HTTP adapters or generate `api-client` yet. Monitor-only operational constants land with the monitor in M2.
Done when: all 13.1 tests pass.

### M1.5. API + auth + realtime foundation (1 to 2 days)
Build the Fastify modular monolith, `/api/auth/*`, all `/v1` routes in 9.1, mandatory session middleware, scoped query modules, stable error mapping, health/readiness endpoints, OpenAPI generation, `packages/api-client`, and the `packages/data` HTTP adapters. Build the single-use realtime ticket exchange, WebSocket server, direct PostgreSQL listener, notification routing, reconnect behavior, CORS from exact `TRUSTED_ORIGINS`, request redaction, graceful shutdown, and an API Dockerfile. Better Auth email confirmation stays disabled; configure only email/password plus its Electron and Expo plugins. Do not add social login or customer-facing password reset.

API constants in `apps/api/src/config.ts`: `API_BODY_LIMIT_BYTES=65536`, `REALTIME_TICKET_TTL_SECONDS=60`, `REALTIME_TICKET_RATE_LIMIT_PER_MINUTE=10`, `MUTATION_RATE_LIMIT_PER_MINUTE=120`, `WS_PING_INTERVAL_MS=30000`, `WS_MAX_LIFETIME_MS=900000`, `RECENT_DEFAULT_PAGE_SIZE=50`, and `RECENT_MAX_PAGE_SIZE=100`.

Approved dependencies for this milestone: `fastify`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/websocket`, `@fastify/swagger`, `@fastify/swagger-ui`, `fastify-type-provider-zod`, `zod`, `better-auth`, `@better-auth/drizzle-adapter`, `@better-auth/electron`, `@better-auth/expo`, `drizzle-orm`, `postgres`, `openapi-typescript`, `openapi-fetch`, `ws`, and `pino`. Use Fastify's native logger through Pino; do not add a second HTTP framework or ORM.

Done when: API authorization, realtime, contract, logging-redaction, and role-boundary tests in 13.3–13.5 pass; two API instances receive the same committed database invalidation; rollback produces none; OpenAPI/client regeneration is clean; `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. Then STOP.

### M2. Monitor + fake source (3 to 4 h)
Build the loop from 7.4, FakeOfferSource, inject CLI, catalog CLI, ProxyPool, proxy parser/CLI, monitor source configuration, delivery dispatcher, maintenance scheduler from 6.5, healthz, and Dockerfile. Use the `notify_monitor` database role and server-only `packages/db`; the business loop remains as specified and invokes PostgreSQL functions through the database driver. Monitor constants in `apps/monitor/src/config.ts`: `PROXY_MAX_ATTEMPTS=5`, `PROXY_COOLDOWN_BASE_MS=30000`, `PROXY_COOLDOWN_CAP_MS=900000`, `PROXY_TEST_TIMEOUT_MS=10000`, `PROXY_TEST_CONCURRENCY=10`, `SOURCE_BACKOFF_BASE_MS=60000`, and `SOURCE_BACKOFF_CAP_MS=900000`. Approved new dependencies for this milestone: `axios`, `https-proxy-agent`, `socks-proxy-agent`, `csv-parse`, and `expo-server-sdk`. FakeOfferSource ignores proxies.
Done when: 13.2 integration and maintenance scenarios pass locally; proxy unit tests in 13.7 pass; repeated import reports all duplicates; local in-process proxy health works without retailer contact; and an injected price drop creates a Recent event that reaches both API WebSocket instances. Tests use an ephemeral `PROXY_ENC_KEY` supplied through the process environment and never logged. Real provider-proxy validation remains gated to M9. This is the first whole-backend win.

### M2.5. Data source feasibility, research only (0.5 to 1 day; no code)
Deliverable: `docs/DATA_SOURCE_REPORT.md`. For each candidate source (commercial feeds and an own-adapter option), report: Target online availability coverage, marketplace seller coverage, item price availability, shipping cost visibility, geographic scope, update latency, rate limits, commercial usage rights, cost, and pre-drop signal availability. End with a ranked recommendation. No integration code; building continues on FakeOfferSource and the real integration stays M9. This front-loads the product's biggest external risk (vendor lead times) while the rest of the build proceeds.
Done when: the report exists with every column filled per candidate and the human has read it.

### M3. Desktop shell + auth + create-alert path (1 to 2 days)
Verify the current Electron support window of the pinned `@better-auth/electron` version, then scaffold electron-vite with the compatible stable Electron major, 10.1 security flags, protected main-process auth storage, login screen, sidebar shell, Home, Browse, and Product Details with every state from 9.6.
Done when: sign in, create an alert from all three entry points, "Alert Set" reflects everywhere, failure state renders when offline.

### M4. Alerts management (1 day)
List, pause/resume optimistic toggle, Edit, single + bulk soft delete with Undo, select mode, realtime invalidation.
Done when: with the desktop app open, an authenticated API probe script at `packages/data/scripts/sync-probe.ts` pauses an alert and the desktop toggle flips through WebSocket invalidation without a refresh; undo restores; delete failure restores the row. Two desktop instances are impossible by design because of the single-instance lock; the cross-platform proof lands in M7.

### M5. Recent (0.5 day)
List with Today/Yesterday grouping, detail with the "Open at Target" button, empty, failure.
Done when: injected events appear grouped correctly in local time; the detail screen matches the injected event row; "Open at Target" opens the seeded `product_url` through validated openExternal.

### M6. Notifications + deep links, desktop first (1 to 2 days; mobile push credentials land in M7)
Main-process realtime subscription (10.3, 10.4), tray, native notification, click-through to the M5 Recent Detail at `/recent/:id`, protocol handler, and updater scaffold. The monitor push dispatcher was built and unit-tested in M2; real mobile delivery remains M7.
Done when: with the desktop window closed to tray, `inject --price` below threshold raises a native notification within one poll interval; clicking it opens Recent Detail; and turning the account-wide toggle off suppresses the next notification while the event still appears in Recent (D21).

### M7. Mobile app (2 to 4 days; credential setup is the slow part)
All five tabs + screens per 9.6, EAS dev build, FCM + APNs credentials, token registration, push tap routing.
Approved M7 dependencies: the D14-pinned `expo`, `react`, and `react-native` versions; `expo-router`, `expo-notifications`, `expo-secure-store`, `expo-network`, `expo-device`, `expo-constants`, `expo-dev-client`, `better-auth`, `@better-auth/expo`, `@tanstack/react-query`, `zustand`, and `zod`. Use `npx expo install` for Expo-managed native packages so their exact versions match SDK 57. Do not install social-auth browser dependencies or add social login.
Done when: on a physical device, an injected price drop delivers a push, tapping it opens Recent Detail, and pausing an alert on the phone flips the desktop toggle live.

### M8. Polish pass (2 to 3 days)
Offline/error components everywhere, retry affordances, notifications banner logic, Account links, analytics event wiring (names in `config/analytics-events.ts`: alert_created, alert_updated, alert_paused, alert_resumed, alert_deleted, alerts_bulk_deleted, alert_triggered, notification_opened, product_viewed, search_performed), crash reporting (desktop: `@sentry/electron` main + renderer; mobile: `@sentry/react-native` with its Expo plugin; API and monitor: `@sentry/node`; DSNs from Section 5), analytics = a typed `emit()` helper in packages/config writing structured logs only, Electron fuse hardening from 10.1, one Playwright-driven Electron smoke test (launch, sign in against the local API, create an alert, see Alert Set), packaged desktop build with updater against a draft GitHub release, and API plus monitor deployed in the same region as hosted Neon. The only new M8 dependencies approved are `@sentry/electron`, `@sentry/react-native`, `@sentry/node`, `@electron/fuses`, and `@playwright/test`.
Apply migrations from a release job with `notify_migrator` before starting the new API version; runtime processes never migrate. Configure Neon with production scale-to-zero disabled and an explicit backup/PITR retention policy, then perform and document one restore drill before launch. Start with one API replica, but keep the load balancer WebSocket-capable; D7 already permits additional API replicas without an architecture change.
Deploy `apps/monitor` with exactly ONE replica; do not enable horizontal autoscaling (fire_alert protects event correctness if two workers overlap, but duplicate workers waste retailer/proxy capacity; leader election or work-claiming is a post-V1 concern).
Done when: every state in 9.6 is reachable and demonstrated; the smoke test passes in CI; packaged apps run against the hosted API and Neon database with the fake source; health/readiness checks pass; the API can restart without losing state; and the monitor runs as a single replica.

### M9. Real data source (unbounded; gated)
Implement the source the human approved from the M2.5 report (FeedOfferSource or TargetOfferSource) per 7.6, with real TCINs and product URLs, per-product intervals, circuit breaker. A TargetOfferSource routes every request through the M2 `ProxyPool` using the group from `monitor_source_config` and obeys the 7.9 transport-vs-retailer rotation rule (already unit-tested in M2).
Done when: `OFFER_SOURCE=<approved source>` produces observations for seeded products without any change outside the approved adapter directory; if TargetOfferSource, `proxy:use --source target --group <name>` selects the pool and transport failures fail over while a simulated 429 does not rotate.

## 15. Auto-Buy seams (do not build; just do not break)

`recent_events.type` already carries future values. When Auto-Buy arrives: a `devices` + heartbeat table, an Electron utility process hosting the local agent, and cloud "missions" route through the same event pipeline. Nothing in V1 may assume `type = 'alert_triggered'` is the only value (switch with default rendering, not if/else).

## 16. Repository agent instructions

The authoritative repository instructions live at root in `AGENTS.md`. They
must preserve Section 0.1's authority order and Section 14.0's one-milestone-at-
a-time execution protocol. Do not create a second agent-instructions file with
a competing authority definition.

## 17. Human-provided external prerequisites

These are human-owned gates, not engineering problems (Section 0.2, rule 10):

```text
M0    Docker Desktop or another Docker Compose-compatible local container runtime
M3    Human-approved reverse-DNS desktop application ID, used consistently by
      electron-builder and Windows app.setAppUserModelId
M7    Human-approved reverse-DNS iOS bundle identifier and Android application ID;
      Apple Developer account + APNs key via EAS; Firebase project + google-services.json (FCM v1);
      EAS account + EXPO_PUBLIC_EAS_PROJECT_ID; one physical iOS or Android device
M8    Neon project with PostgreSQL 17; pooled `notify_api` URL, direct listener URL,
      `notify_monitor` URL, and migration URL. API and monitor hosting accounts in
      the same region as Neon; production API origin/domain and exact trusted origins.
M8    GitHub repository + release token for electron-updater publishing; macOS Developer ID
      certificate + notarization credentials (Windows code signing optional in V1);
      human-approved mobile release channel (EAS internal, TestFlight/Play testing,
      or public stores) plus App Store Connect/Google Play Console access when that
      channel requires it;
      Sentry org + the four DSNs in Section 5;
      approved application and tray icon assets for distributable builds;
      approved HTTPS URLs for Help Center, Contact Support, About, Privacy Policy,
      and Terms (their hostnames populate EXTERNAL_HOSTS; never invent placeholders);
      approved product-image hostnames for PRODUCT_IMAGE_HOSTS, or keep product images null
M9    Contract and credentials for the approved data source; if TargetOfferSource, a proxy list exported from a provider (TXT/CSV)
```

## 18. Competitor research location

The Guppy research that produced D16 to D20 lives in `docs/COMPETITOR_RESEARCH.md`. It is background, not implementation authority: the decision log rows are the only competitor-derived content the agent acts on. Do not change product behavior based on the research document.
