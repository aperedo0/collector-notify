import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOCAL_MIGRATION_URL,
  assertLocalResetUrl,
  runtimeProcess,
} from "../src/environment.ts";
import { MIGRATOR_DEFAULT_PRIVILEGES_RESET_SQL } from "../src/default-privileges.ts";
import { assertMigrationLedgerIntegrity } from "../src/migration-integrity.ts";
import { SEED_PRODUCTS } from "../src/seed-data.ts";

const LOCAL_BOOTSTRAP_URL =
  "postgresql://notify_bootstrap:notify_local_bootstrap@127.0.0.1:54329/notify";
const LOCAL_API_URL =
  "postgresql://notify_api:notify_local_api@127.0.0.1:54329/notify";
const LOCAL_MONITOR_URL =
  "postgresql://notify_monitor:notify_local_monitor@127.0.0.1:54329/notify";
const BOOTSTRAP_SQL_PATH = `${runtimeProcess.cwd()}/docker/init/000_roles.sql`;
const MIGRATIONS_FOLDER = `${runtimeProcess.cwd()}/migrations`;

const expectedTables = [
  "accounts",
  "alert_trigger_state",
  "alerts",
  "fake_offers",
  "maintenance_job_state",
  "monitor_product_state",
  "monitor_source_config",
  "monitor_source_state",
  "notification_deliveries",
  "offer_observations",
  "products",
  "proxy_endpoints",
  "proxy_groups",
  "push_tokens",
  "realtime_tickets",
  "recent_events",
  "sessions",
  "user_preferences",
  "users",
  "verifications",
] as const;

const expectedFunctions = [
  "emit_realtime_notification",
  "fire_alert",
  "handle_new_user",
  "invalidate_deliveries_on_token_change",
  "rearm_alert",
  "set_updated_at",
] as const;

const expectedTriggers = [
  "alerts_realtime",
  "alerts_rearm_insert",
  "alerts_rearm_update",
  "alerts_touch",
  "on_auth_user_created",
  "prefs_touch",
  "push_tokens_invalidate_deliveries_delete",
  "push_tokens_invalidate_deliveries_update",
  "recent_events_realtime",
  "user_preferences_realtime",
] as const;

const expectedIndexes = [
  "accounts_userId_idx",
  "alerts_by_product",
  "alerts_one_active_per_product",
  "deliveries_pending_by_target",
  "offer_obs_by_product",
  "proxy_by_group",
  "realtime_tickets_expiry",
  "recent_by_user",
  "sessions_userId_idx",
  "verifications_identifier_idx",
] as const;

const expectedCheckConstraints = [
  "alerts_price_threshold_cents_check",
  "alerts_status_check",
  "notification_deliveries_channel_check",
  "products_confirm_observations_check",
  "products_default_alert_price_cents_check",
  "proxy_endpoints_port_check",
  "proxy_endpoints_protocol_check",
  "push_tokens_platform_check",
  "user_preferences_plan_check",
] as const;

type ColumnPrivilege = "SELECT" | "INSERT" | "UPDATE";
type TablePrivilege = "DELETE" | "TRUNCATE" | "REFERENCES" | "TRIGGER";
type MatrixRole = "notify_api" | "notify_monitor" | "public";

// A role's grant on one table, transcribed line-by-line from PLAN.md section
// 6.3. `"*"` means every column of the table holds that privilege; a column
// name array means only those columns do; an absent key means the role holds
// none of that privilege anywhere on the table.
type TableRoleGrant = {
  readonly select?: "*" | readonly string[];
  readonly insert?: "*" | readonly string[];
  readonly update?: "*" | readonly string[];
  readonly tablePrivileges?: readonly TablePrivilege[];
};

const NO_PRIVILEGES: TableRoleGrant = {};

// `has_table_privilege` cannot see column-level grants — measured:
// `has_table_privilege('notify_api', 'user_preferences', 'UPDATE')` is false
// while the column grant on `notifications_enabled` exists — so it would
// encode four real section 6.3 grants as "no privilege" and could not detect
// their revocation. SELECT/INSERT/UPDATE are therefore asserted per column
// with `has_column_privilege` below; DELETE/TRUNCATE/REFERENCES/TRIGGER are
// whole-table-only privileges in this schema, asserted with
// `has_table_privilege`. `public` carries an empty grant on every table: a
// per-table `GRANT ... TO PUBLIC` would otherwise be invisible to this suite.
const GRANT_MATRIX: Record<
  (typeof expectedTables)[number],
  Record<MatrixRole, TableRoleGrant>
> = {
  accounts: {
    notify_api: { select: "*", insert: "*", update: "*", tablePrivileges: ["DELETE"] },
    notify_monitor: NO_PRIVILEGES,
    public: NO_PRIVILEGES,
  },
  alert_trigger_state: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  alerts: {
    notify_api: {
      select: "*",
      insert: "*",
      update: ["price_threshold_cents", "status", "deleted_at"],
    },
    notify_monitor: { select: "*", tablePrivileges: ["DELETE"] },
    public: NO_PRIVILEGES,
  },
  fake_offers: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  maintenance_job_state: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  monitor_product_state: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  monitor_source_config: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  monitor_source_state: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  notification_deliveries: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  offer_observations: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  products: {
    notify_api: { select: "*" },
    notify_monitor: { select: "*", insert: "*", update: "*" },
    public: NO_PRIVILEGES,
  },
  proxy_endpoints: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  proxy_groups: {
    notify_api: NO_PRIVILEGES,
    notify_monitor: {
      select: "*",
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  push_tokens: {
    notify_api: { select: "*", insert: "*", update: "*", tablePrivileges: ["DELETE"] },
    notify_monitor: { select: "*", tablePrivileges: ["DELETE"] },
    public: NO_PRIVILEGES,
  },
  realtime_tickets: {
    notify_api: {
      select: ["ticket_hash", "user_id", "expires_at", "consumed_at"],
      insert: "*",
      update: "*",
      tablePrivileges: ["DELETE"],
    },
    notify_monitor: {
      select: ["expires_at", "consumed_at"],
      tablePrivileges: ["DELETE"],
    },
    public: NO_PRIVILEGES,
  },
  recent_events: {
    notify_api: { select: "*" },
    // INSERT on recent_events happens only through the security-definer
    // `fire_alert`; notify_monitor holds no direct table-level INSERT.
    notify_monitor: { select: "*", tablePrivileges: ["DELETE"] },
    public: NO_PRIVILEGES,
  },
  sessions: {
    notify_api: { select: "*", insert: "*", update: "*", tablePrivileges: ["DELETE"] },
    notify_monitor: NO_PRIVILEGES,
    public: NO_PRIVILEGES,
  },
  user_preferences: {
    notify_api: { select: "*", update: ["notifications_enabled"] },
    notify_monitor: { select: "*" },
    public: NO_PRIVILEGES,
  },
  users: {
    notify_api: { select: "*", insert: "*", update: "*", tablePrivileges: ["DELETE"] },
    notify_monitor: NO_PRIVILEGES,
    public: NO_PRIVILEGES,
  },
  verifications: {
    notify_api: { select: "*", insert: "*", update: "*", tablePrivileges: ["DELETE"] },
    notify_monitor: NO_PRIVILEGES,
    public: NO_PRIVILEGES,
  },
};

function expectedColumnPrivilege(
  table: string,
  role: MatrixRole,
  column: string,
  privilege: ColumnPrivilege,
): boolean {
  const grant = GRANT_MATRIX[table as (typeof expectedTables)[number]][role];
  const grantedColumns =
    privilege === "SELECT" ? grant.select : privilege === "INSERT" ? grant.insert : grant.update;
  if (grantedColumns === undefined) {
    return false;
  }
  return grantedColumns === "*" || grantedColumns.includes(column);
}

function expectedTablePrivilege(
  table: string,
  role: MatrixRole,
  privilege: TablePrivilege,
): boolean {
  const grant = GRANT_MATRIX[table as (typeof expectedTables)[number]][role];
  return grant.tablePrivileges?.includes(privilege) ?? false;
}

// Tuple inventories for step 10: name-only inventories (the first test below)
// cannot see a trigger's WHEN clause or column list, a function's SECURITY
// DEFINER flag or search_path, a constraint's ON DELETE action, or an
// index's NULLS ordering. `pg_get_triggerdef` carries timing, event, column
// list, WHEN clause, and function in one string, so it cannot render
// identically for two triggers that differ only in those — exactly what
// D35's split of `alerts_rearm` turns on.
const expectedFunctionTuples = [
  {
    function_name: "emit_realtime_notification()",
    prosecdef: true,
    proconfig: ["search_path=public"],
  },
  {
    function_name: "fire_alert(uuid,text,integer,integer)",
    prosecdef: true,
    proconfig: ["search_path=public"],
  },
  {
    function_name: "handle_new_user()",
    prosecdef: true,
    proconfig: ["search_path=public"],
  },
  {
    function_name: "invalidate_deliveries_on_token_change()",
    prosecdef: true,
    proconfig: ["search_path=public"],
  },
  {
    function_name: "rearm_alert()",
    prosecdef: true,
    proconfig: ["search_path=public"],
  },
  {
    function_name: "set_updated_at()",
    prosecdef: false,
    proconfig: ["search_path=public"],
  },
];

const expectedTriggerDefinitions = [
  {
    trigger_name: "alerts_realtime",
    table_name: "alerts",
    definition:
      "CREATE TRIGGER alerts_realtime AFTER INSERT OR UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION emit_realtime_notification()",
  },
  {
    trigger_name: "alerts_rearm_insert",
    table_name: "alerts",
    definition:
      "CREATE TRIGGER alerts_rearm_insert AFTER INSERT ON public.alerts FOR EACH ROW EXECUTE FUNCTION rearm_alert()",
  },
  {
    trigger_name: "alerts_rearm_update",
    table_name: "alerts",
    definition:
      "CREATE TRIGGER alerts_rearm_update AFTER UPDATE OF price_threshold_cents, status ON public.alerts FOR EACH ROW WHEN (((old.price_threshold_cents IS DISTINCT FROM new.price_threshold_cents) OR (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION rearm_alert()",
  },
  {
    trigger_name: "alerts_touch",
    table_name: "alerts",
    definition:
      "CREATE TRIGGER alerts_touch BEFORE UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at()",
  },
  {
    trigger_name: "on_auth_user_created",
    table_name: "users",
    definition:
      "CREATE TRIGGER on_auth_user_created AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()",
  },
  {
    trigger_name: "prefs_touch",
    table_name: "user_preferences",
    definition:
      "CREATE TRIGGER prefs_touch BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at()",
  },
  {
    trigger_name: "push_tokens_invalidate_deliveries_delete",
    table_name: "push_tokens",
    definition:
      "CREATE TRIGGER push_tokens_invalidate_deliveries_delete AFTER DELETE ON public.push_tokens FOR EACH ROW EXECUTE FUNCTION invalidate_deliveries_on_token_change()",
  },
  {
    trigger_name: "push_tokens_invalidate_deliveries_update",
    table_name: "push_tokens",
    definition:
      "CREATE TRIGGER push_tokens_invalidate_deliveries_update AFTER UPDATE OF user_id ON public.push_tokens FOR EACH ROW WHEN ((old.user_id IS DISTINCT FROM new.user_id)) EXECUTE FUNCTION invalidate_deliveries_on_token_change()",
  },
  {
    trigger_name: "recent_events_realtime",
    table_name: "recent_events",
    definition:
      "CREATE TRIGGER recent_events_realtime AFTER INSERT ON public.recent_events FOR EACH ROW EXECUTE FUNCTION emit_realtime_notification()",
  },
  {
    trigger_name: "user_preferences_realtime",
    table_name: "user_preferences",
    definition:
      "CREATE TRIGGER user_preferences_realtime AFTER INSERT OR UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION emit_realtime_notification()",
  },
];

// `confdeltype` is blank (a single space) on the unique constraints below —
// it is only meaningful for foreign keys — and is asserted anyway because a
// future migration could turn one of them into a foreign key without
// renaming it.
const expectedUniqueAndForeignKeyConstraints = [
  {
    constraint_name: "accounts_user_id_users_id_fk",
    table_name: "accounts",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "alert_trigger_state_alert_id_alerts_id_fk",
    table_name: "alert_trigger_state",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "alerts_product_id_products_id_fk",
    table_name: "alerts",
    contype: "f",
    confdeltype: "a",
  },
  {
    constraint_name: "alerts_user_id_users_id_fk",
    table_name: "alerts",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "fake_offers_product_id_products_id_fk",
    table_name: "fake_offers",
    contype: "f",
    confdeltype: "a",
  },
  {
    constraint_name: "monitor_product_state_product_id_products_id_fk",
    table_name: "monitor_product_state",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "monitor_source_config_proxy_group_id_proxy_groups_id_fk",
    table_name: "monitor_source_config",
    contype: "f",
    confdeltype: "n",
  },
  {
    constraint_name: "notification_deliveries_event_channel_target_unique",
    table_name: "notification_deliveries",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "notification_deliveries_event_id_recent_events_id_fk",
    table_name: "notification_deliveries",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "offer_observations_product_id_products_id_fk",
    table_name: "offer_observations",
    contype: "f",
    confdeltype: "a",
  },
  {
    constraint_name: "products_retailer_product_id_unique",
    table_name: "products",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "products_slug_unique",
    table_name: "products",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "proxy_endpoints_group_id_proxy_groups_id_fk",
    table_name: "proxy_endpoints",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "proxy_endpoints_group_protocol_host_port_username_fp_unique",
    table_name: "proxy_endpoints",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "proxy_groups_name_unique",
    table_name: "proxy_groups",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "push_tokens_expo_push_token_unique",
    table_name: "push_tokens",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "push_tokens_user_id_users_id_fk",
    table_name: "push_tokens",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "realtime_tickets_user_id_users_id_fk",
    table_name: "realtime_tickets",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "recent_events_alert_id_alerts_id_fk",
    table_name: "recent_events",
    contype: "f",
    confdeltype: "n",
  },
  {
    constraint_name: "recent_events_alert_id_trigger_key_unique",
    table_name: "recent_events",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "recent_events_product_id_products_id_fk",
    table_name: "recent_events",
    contype: "f",
    confdeltype: "a",
  },
  {
    constraint_name: "recent_events_user_id_users_id_fk",
    table_name: "recent_events",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "sessions_token_unique",
    table_name: "sessions",
    contype: "u",
    confdeltype: " ",
  },
  {
    constraint_name: "sessions_user_id_users_id_fk",
    table_name: "sessions",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "user_preferences_user_id_users_id_fk",
    table_name: "user_preferences",
    contype: "f",
    confdeltype: "c",
  },
  {
    constraint_name: "users_email_unique",
    table_name: "users",
    contype: "u",
    confdeltype: " ",
  },
];

// `pg_indexes.indexdef` renders NULLS ordering explicitly only when it is not
// the type's default, so a plain `DESC` here (not `DESC NULLS FIRST`) is what
// distinguishes the fixed section 6.1 indexes from the pre-0004 `DESC NULLS
// LAST` ones the planner could not use for an `ORDER BY ... DESC` index scan.
const expectedIndexDefinitions: Record<(typeof expectedIndexes)[number], string> = {
  accounts_userId_idx:
    'CREATE INDEX "accounts_userId_idx" ON public.accounts USING btree (user_id)',
  alerts_by_product:
    "CREATE INDEX alerts_by_product ON public.alerts USING btree (product_id) WHERE (deleted_at IS NULL)",
  alerts_one_active_per_product:
    "CREATE UNIQUE INDEX alerts_one_active_per_product ON public.alerts USING btree (user_id, product_id) WHERE (deleted_at IS NULL)",
  deliveries_pending_by_target:
    "CREATE INDEX deliveries_pending_by_target ON public.notification_deliveries USING btree (target) WHERE (status = 'pending'::text)",
  offer_obs_by_product:
    "CREATE INDEX offer_obs_by_product ON public.offer_observations USING btree (product_id, observed_at DESC)",
  proxy_by_group:
    "CREATE INDEX proxy_by_group ON public.proxy_endpoints USING btree (group_id) WHERE enabled",
  realtime_tickets_expiry:
    "CREATE INDEX realtime_tickets_expiry ON public.realtime_tickets USING btree (expires_at)",
  recent_by_user:
    "CREATE INDEX recent_by_user ON public.recent_events USING btree (user_id, occurred_at DESC)",
  sessions_userId_idx:
    'CREATE INDEX "sessions_userId_idx" ON public.sessions USING btree (user_id)',
  verifications_identifier_idx:
    "CREATE INDEX verifications_identifier_idx ON public.verifications USING btree (identifier)",
};

const postgresOptions = { max: 1, onnotice: () => undefined } as const;

let migrator: Sql;
let api: Sql;
let monitor: Sql;
let bootstrap: Sql;

async function expectPermissionDenied(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
    throw new Error("Expected PostgreSQL to deny the operation.");
  } catch (error: unknown) {
    expect(error).toMatchObject({ code: "42501" });
  }
}

async function expectFireAlertNullGuard(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
    throw new Error("Expected fire_alert to raise on the null argument.");
  } catch (error: unknown) {
    // PostgreSQL reports a plpgsql RAISE EXCEPTION as SQLSTATE P0001.
    expect(error).toMatchObject({
      code: "P0001",
      message: "fire_alert requires non-null arguments",
    });
  }
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the query to return one row.");
  }
  return row;
}

let fixtureSequence = 0;
// `Date.now()` alone can collide across fixtures created moments apart in
// the same test file; the counter guarantees uniqueness.
function nextFixtureSuffix(): string {
  fixtureSequence += 1;
  return `${String(Date.now())}-${String(fixtureSequence)}`;
}

function freshTriggerKey(): string {
  return `m0-fire-${nextFixtureSuffix()}`;
}

// D6's 30-minute cooldown. `MIN_RETRIGGER_MINUTES` does not exist until M1,
// so `fire_alert`'s cooldown argument is hard-coded here. At the config's
// eventual 180-minute default the 2-hour backdating used below would fall
// inside the cooldown window and mask a missing armed-gate check.
const FIRE_ALERT_COOLDOWN_MINUTES = 30;

async function callFireAlert(
  alertId: string,
  triggerKey: string,
  priceCents: number,
): Promise<string | null> {
  const rows = await monitor<{ event_id: string | null }[]>`
    SELECT public.fire_alert(
      ${alertId}::uuid,
      ${triggerKey},
      ${priceCents},
      ${FIRE_ALERT_COOLDOWN_MINUTES}
    ) AS event_id
  `;
  return firstRow(rows).event_id;
}

async function readAlertTriggerState(
  alertId: string,
): Promise<{ armed: boolean; last_triggered_at: Date | null }> {
  const rows = await migrator<{ armed: boolean; last_triggered_at: Date | null }[]>`
    SELECT armed, last_triggered_at
      FROM alert_trigger_state
     WHERE alert_id = ${alertId}
  `;
  return firstRow(rows);
}

// `fire_alert` waiting on a contended row lock is invisible to a client on its
// own — the call simply takes as long as the holder does — so `lock_timeout`
// makes the wait observable by aborting the statement with 55P03
// (lock_not_available) instead. `monitor.begin` is deliberate: it rolls back on
// throw, whereas a raw `BEGIN` on this module-level `max: 1` handle would leave
// an aborted transaction behind and fail every later test with 25P02.
async function expectFireAlertToBlock(alertId: string, priceCents: number): Promise<void> {
  try {
    await monitor.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '250ms'");
      return transaction`
        SELECT public.fire_alert(
          ${alertId}::uuid,
          ${freshTriggerKey()},
          ${priceCents},
          ${FIRE_ALERT_COOLDOWN_MINUTES}
        )
      `;
    });
    throw new Error("Expected fire_alert to wait for the contended alerts row lock.");
  } catch (error: unknown) {
    expect(error).toMatchObject({ code: "55P03" });
  }
}

// Holds an UNCOMMITTED soft delete of one alert open for the duration of
// `whileHeld`, then rolls it back so the fixture teardown sees the alert in its
// original state.
//
// It runs on its own connection, not the shared `api` handle, because every
// shared handle is `max: 1`: holding a transaction open on one would starve the
// connection the rest of the test needs and hang the suite. `notify_api` is the
// role that owns this write path — it holds the column-level UPDATE on
// `alerts.deleted_at` that `notify_monitor` lacks.
async function whileSoftDeleteIsInFlight(
  alertId: string,
  whileHeld: () => Promise<void>,
): Promise<void> {
  const connection = postgres(LOCAL_API_URL, postgresOptions);
  try {
    const holder = await connection.reserve();
    try {
      await holder.unsafe("BEGIN");
      try {
        // Awaited to completion before `whileHeld` runs, so whatever it does
        // begins only once this soft delete holds the alerts row. That ordering
        // is the handshake — no sleeps, no timing assumptions.
        await holder`UPDATE alerts SET deleted_at = now() WHERE id = ${alertId}`;
        await whileHeld();
      } finally {
        await holder.unsafe("ROLLBACK");
      }
    } finally {
      holder.release();
    }
  } finally {
    await connection.end();
  }
}

// Read on `migrator`: `notify_api` has no access at all to the delivery outbox.
async function readDeliveryOutcome(
  eventId: string,
): Promise<{ status: string; last_error: string | null }> {
  const rows = await migrator<{ status: string; last_error: string | null }[]>`
    SELECT status, last_error
      FROM notification_deliveries
     WHERE event_id = ${eventId}
  `;
  return firstRow(rows);
}

// PLAN.md section 6.2's "Push token registration" invariant, verbatim in shape:
// one upsert atomically assigns the token to the current session user. This is
// the statement the mobile app actually runs, so D40's trigger has to fire on
// it and not merely on a bare `UPDATE`.
async function registerPushToken(pushToken: string, ownerId: string): Promise<void> {
  await migrator`
    INSERT INTO push_tokens (user_id, platform, expo_push_token)
    VALUES (${ownerId}, 'ios', ${pushToken})
    ON CONFLICT (expo_push_token) DO UPDATE
      SET user_id = excluded.user_id,
          platform = excluded.platform,
          last_seen_at = now()
  `;
}

beforeAll(() => {
  bootstrap = postgres(LOCAL_BOOTSTRAP_URL, postgresOptions);
  migrator = postgres(LOCAL_MIGRATION_URL, postgresOptions);
  api = postgres(LOCAL_API_URL, postgresOptions);
  monitor = postgres(LOCAL_MONITOR_URL, postgresOptions);
});

afterAll(async () => {
  await Promise.all([bootstrap.end(), migrator.end(), api.end(), monitor.end()]);
});

describe("M0 PostgreSQL foundation", () => {
  it("contains the complete table, function, and trigger inventory", async () => {
    const tables = await migrator<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name <> '__drizzle_migrations'
       ORDER BY table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([...expectedTables].sort());

    const functions = await migrator<{ routine_name: string }[]>`
      SELECT routine_name
        FROM information_schema.routines
       WHERE routine_schema = 'public'
         AND routine_name = ANY(${migrator.array([...expectedFunctions])})
       ORDER BY routine_name
    `;
    expect(functions.map((row) => row.routine_name)).toEqual(
      [...expectedFunctions].sort(),
    );

    const triggers = await migrator<{ trigger_name: string }[]>`
      SELECT DISTINCT trigger_name
        FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY trigger_name
    `;
    expect(triggers.map((row) => row.trigger_name)).toEqual([...expectedTriggers].sort());

    const indexes = await migrator<{ indexname: string }[]>`
      SELECT indexname
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY(${migrator.array([...expectedIndexes])})
       ORDER BY indexname
    `;
    expect(indexes.map((row) => row.indexname)).toEqual([...expectedIndexes].sort());

    const checks = await migrator<{ constraint_name: string }[]>`
      SELECT constraint_name
        FROM information_schema.table_constraints
       WHERE constraint_schema = 'public'
         AND constraint_type = 'CHECK'
         AND constraint_name = ANY(${migrator.array([...expectedCheckConstraints])})
       ORDER BY constraint_name
    `;
    expect(checks.map((row) => row.constraint_name)).toEqual(
      [...expectedCheckConstraints].sort(),
    );

    const extensions = await migrator<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'
    `;
    expect(extensions).toEqual([{ extname: "pgcrypto" }]);

    const publiclyExecutableFunctions = await migrator<
      { function_name: string }[]
    >`
      SELECT procedure.oid::regprocedure::text AS function_name
        FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND has_function_privilege('public', procedure.oid, 'EXECUTE')
       ORDER BY function_name
    `;
    expect(publiclyExecutableFunctions).toEqual([]);

    const unexpectedPgcryptoOwners = await migrator<
      { function_name: string; owner: string }[]
    >`
      SELECT
        procedure.oid::regprocedure::text AS function_name,
        pg_get_userbyid(procedure.proowner) AS owner
        FROM pg_proc AS procedure
        JOIN pg_depend AS dependency
          ON dependency.classid = 'pg_proc'::regclass
         AND dependency.objid = procedure.oid
         AND dependency.deptype = 'e'
        JOIN pg_extension AS extension ON extension.oid = dependency.refobjid
       WHERE extension.extname = 'pgcrypto'
         AND pg_get_userbyid(procedure.proowner) <> 'notify_migrator'
       ORDER BY function_name
    `;
    expect(unexpectedPgcryptoOwners).toEqual([]);
  });

  it("uses timestamptz for every timestamp column", async () => {
    const nonCompliant = await migrator<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type LIKE 'timestamp%'
         AND data_type <> 'timestamp with time zone'
    `;
    expect(nonCompliant).toEqual([]);
  });

  it("keeps schema ownership and role attributes least-privilege", async () => {
    const roles = await migrator<
      {
        rolname: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolconnlimit: number;
        rolinherit: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
        password_never_expires: boolean;
      }[]
    >`
      SELECT
        rolname,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolconnlimit,
        rolinherit,
        rolreplication,
        rolbypassrls,
        rolvaliduntil IS null
          OR rolvaliduntil = 'infinity'::timestamptz AS password_never_expires
        FROM pg_roles
       WHERE rolname = ANY(${migrator.array([
         "notify_migrator",
         "notify_api",
         "notify_monitor",
       ])})
       ORDER BY rolname
    `;
    expect(roles).toEqual([
      {
        rolname: "notify_api",
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolconnlimit: -1,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
        password_never_expires: true,
      },
      {
        rolname: "notify_migrator",
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolconnlimit: -1,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
        password_never_expires: true,
      },
      {
        rolname: "notify_monitor",
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolconnlimit: -1,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
        password_never_expires: true,
      },
    ]);

    const memberships = await migrator<
      { granted_role: string; member_role: string }[]
    >`
      SELECT
        granted_role.rolname AS granted_role,
        member_role.rolname AS member_role
      FROM pg_auth_members AS membership
      JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
      JOIN pg_roles AS member_role ON member_role.oid = membership.member
      WHERE member_role.rolname = ANY(${migrator.array([
        "notify_migrator",
        "notify_api",
        "notify_monitor",
      ])})
         OR granted_role.rolname = ANY(${migrator.array([
           "notify_migrator",
           "notify_api",
           "notify_monitor",
         ])})
      ORDER BY member_role, granted_role
    `;
    expect(memberships).toEqual([]);

    const schemaRows = await migrator<
      { owner: string; api_can_create: boolean; monitor_can_create: boolean }[]
    >`
      SELECT
        pg_get_userbyid(nspowner) AS owner,
        has_schema_privilege('notify_api', 'public', 'CREATE') AS api_can_create,
        has_schema_privilege('notify_monitor', 'public', 'CREATE') AS monitor_can_create
      FROM pg_namespace
      WHERE nspname = 'public'
    `;
    expect(schemaRows).toEqual([
      { owner: "notify_migrator", api_can_create: false, monitor_can_create: false },
    ]);

    const databasePrivileges = await migrator<
      {
        api_can_create: boolean;
        api_can_temp: boolean;
        monitor_can_create: boolean;
        monitor_can_temp: boolean;
      }[]
    >`
      SELECT
        has_database_privilege(
          'notify_api',
          current_database(),
          'CREATE'
        ) AS api_can_create,
        has_database_privilege('notify_api', current_database(), 'TEMP') AS api_can_temp,
        has_database_privilege(
          'notify_monitor',
          current_database(),
          'CREATE'
        ) AS monitor_can_create,
        has_database_privilege(
          'notify_monitor',
          current_database(),
          'TEMP'
        ) AS monitor_can_temp
    `;
    expect(databasePrivileges).toEqual([
      {
        api_can_create: false,
        api_can_temp: false,
        monitor_can_create: false,
        monitor_can_temp: false,
      },
    ]);

    const unexpectedTableOwners = await migrator<
      { table_name: string; tableowner: string }[]
    >`
      SELECT tablename AS table_name, tableowner
        FROM pg_tables
       WHERE schemaname = 'public'
         AND tableowner <> 'notify_migrator'
    `;
    expect(unexpectedTableOwners).toEqual([]);
  });

  it("converges pre-existing database roles back to least privilege", async () => {
    const connection = await bootstrap.reserve();
    try {
      await connection.unsafe("BEGIN");
      try {
        await connection.unsafe(`
          CREATE ROLE m0_bootstrap_membership_probe NOLOGIN BYPASSRLS;
          CREATE ROLE m0_bootstrap_membership_grantor NOLOGIN CREATEROLE;
          CREATE ROLE m0_bootstrap_membership_downstream NOLOGIN;
          CREATE ROLE m0_bootstrap_runtime_delegatee NOLOGIN;
          CREATE ROLE m0_bootstrap_database_grantor NOLOGIN;
          CREATE ROLE m0_bootstrap_function_grantor NOLOGIN;
          CREATE ROLE m0_bootstrap_schema_owner NOLOGIN;
          CREATE ROLE m0_bootstrap_schema_grantor NOLOGIN;
          ALTER ROLE notify_migrator BYPASSRLS REPLICATION
            CONNECTION LIMIT 0 VALID UNTIL '2000-01-01 00:00:00+00';
          ALTER ROLE notify_api BYPASSRLS REPLICATION CREATEROLE
            CONNECTION LIMIT 0 VALID UNTIL '2000-01-01 00:00:00+00';
          ALTER ROLE notify_monitor BYPASSRLS REPLICATION
            CONNECTION LIMIT 1 VALID UNTIL '2000-01-01 00:00:00+00';
          GRANT CREATE, TEMPORARY ON DATABASE notify
            TO m0_bootstrap_database_grantor WITH GRANT OPTION;
          SET ROLE m0_bootstrap_database_grantor;
          GRANT CREATE, TEMPORARY ON DATABASE notify
            TO PUBLIC, notify_api, notify_monitor;
          RESET ROLE;
          GRANT m0_bootstrap_membership_probe
            TO m0_bootstrap_membership_grantor WITH ADMIN OPTION;
          SET ROLE m0_bootstrap_membership_grantor;
          GRANT m0_bootstrap_membership_probe
            TO notify_migrator, notify_monitor;
          GRANT m0_bootstrap_membership_probe
            TO notify_api WITH ADMIN OPTION;
          RESET ROLE;
          SET ROLE notify_api;
          GRANT m0_bootstrap_membership_probe
            TO m0_bootstrap_membership_downstream;
          RESET ROLE;
          GRANT notify_migrator, notify_api, notify_monitor
            TO m0_bootstrap_runtime_delegatee;
          SET ROLE notify_migrator;
          CREATE PROCEDURE public.m0_bootstrap_public_procedure_probe()
          LANGUAGE sql
          AS 'SELECT 1';
          GRANT EXECUTE ON PROCEDURE public.m0_bootstrap_public_procedure_probe()
            TO m0_bootstrap_function_grantor WITH GRANT OPTION;
          RESET ROLE;
          GRANT USAGE ON SCHEMA public TO m0_bootstrap_function_grantor;
          GRANT EXECUTE ON FUNCTION public.digest(bytea, text)
            TO m0_bootstrap_function_grantor WITH GRANT OPTION;
          SET ROLE m0_bootstrap_function_grantor;
          GRANT EXECUTE ON FUNCTION public.digest(bytea, text)
            TO PUBLIC, notify_api, notify_monitor;
          GRANT EXECUTE ON PROCEDURE public.m0_bootstrap_public_procedure_probe()
            TO PUBLIC;
          RESET ROLE;
          REVOKE USAGE ON SCHEMA public FROM m0_bootstrap_function_grantor;
          GRANT CREATE, USAGE ON SCHEMA public
            TO m0_bootstrap_schema_grantor WITH GRANT OPTION;
          SET ROLE m0_bootstrap_schema_grantor;
          GRANT CREATE, USAGE ON SCHEMA public
            TO PUBLIC, notify_api, notify_monitor;
          RESET ROLE;
          ALTER SCHEMA public OWNER TO m0_bootstrap_schema_owner;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator
            GRANT ALL ON TABLES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator
            GRANT ALL ON SEQUENCES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator
            GRANT EXECUTE ON FUNCTIONS TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator IN SCHEMA public
            GRANT ALL ON TABLES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator IN SCHEMA public
            GRANT ALL ON SEQUENCES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator IN SCHEMA public
            GRANT EXECUTE ON FUNCTIONS TO PUBLIC, notify_api, notify_monitor;
        `);

        await connection.file(BOOTSTRAP_SQL_PATH, { cache: false });

        await connection.unsafe(`
          SET ROLE notify_migrator;
          CREATE TABLE public.m0_bootstrap_default_acl_table_probe (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            secret text NOT NULL
          );
          CREATE FUNCTION public.m0_bootstrap_default_acl_function_probe()
          RETURNS text
          LANGUAGE sql
          AS 'SELECT ''secret''::text';
          RESET ROLE;
        `);

        const roles = await connection<
          {
            password_never_expires: boolean;
            rolbypassrls: boolean;
            rolconnlimit: number;
            rolcreaterole: boolean;
            rolname: string;
            rolreplication: boolean;
          }[]
        >`
          SELECT
            rolname,
            rolcreaterole,
            rolreplication,
            rolbypassrls,
            rolconnlimit,
            rolvaliduntil = 'infinity'::timestamptz AS password_never_expires
            FROM pg_roles
           WHERE rolname = ANY(${connection.array([
             "notify_migrator",
             "notify_api",
             "notify_monitor",
           ])})
           ORDER BY rolname
        `;
        expect(roles).toEqual([
          {
            password_never_expires: true,
            rolbypassrls: false,
            rolconnlimit: -1,
            rolcreaterole: false,
            rolname: "notify_api",
            rolreplication: false,
          },
          {
            password_never_expires: true,
            rolbypassrls: false,
            rolconnlimit: -1,
            rolcreaterole: false,
            rolname: "notify_migrator",
            rolreplication: false,
          },
          {
            password_never_expires: true,
            rolbypassrls: false,
            rolconnlimit: -1,
            rolcreaterole: false,
            rolname: "notify_monitor",
            rolreplication: false,
          },
        ]);

        const databasePrivileges = await connection<
          {
            api_can_create: boolean;
            api_can_temp: boolean;
            monitor_can_create: boolean;
            monitor_can_temp: boolean;
            public_privilege_count: number;
          }[]
        >`
          SELECT
            has_database_privilege(
              'notify_api',
              'notify',
              'CREATE'
            ) AS api_can_create,
            has_database_privilege('notify_api', 'notify', 'TEMP') AS api_can_temp,
            has_database_privilege(
              'notify_monitor',
              'notify',
              'CREATE'
            ) AS monitor_can_create,
            has_database_privilege(
              'notify_monitor',
              'notify',
              'TEMP'
            ) AS monitor_can_temp,
            (
              SELECT count(*)::int
                FROM pg_database AS database
                CROSS JOIN LATERAL aclexplode(database.datacl) AS privilege
               WHERE database.datname = 'notify'
                 AND privilege.grantee = 0
            ) AS public_privilege_count
        `;
        expect(databasePrivileges).toEqual([
          {
            api_can_create: false,
            api_can_temp: false,
            monitor_can_create: false,
            monitor_can_temp: false,
            public_privilege_count: 0,
          },
        ]);

        const schemaPrivileges = await connection<
          {
            api_can_create: boolean;
            api_can_use: boolean;
            monitor_can_create: boolean;
            monitor_can_use: boolean;
            owner: string;
            public_privilege_count: number;
          }[]
        >`
          SELECT
            pg_get_userbyid(namespace.nspowner) AS owner,
            has_schema_privilege(
              'notify_api',
              'public',
              'CREATE'
            ) AS api_can_create,
            has_schema_privilege(
              'notify_api',
              'public',
              'USAGE'
            ) AS api_can_use,
            has_schema_privilege(
              'notify_monitor',
              'public',
              'CREATE'
            ) AS monitor_can_create,
            has_schema_privilege(
              'notify_monitor',
              'public',
              'USAGE'
            ) AS monitor_can_use,
            (
              SELECT count(*)::int
                FROM pg_namespace AS public_namespace
                CROSS JOIN LATERAL aclexplode(public_namespace.nspacl) AS privilege
               WHERE public_namespace.nspname = 'public'
                 AND privilege.grantee = 0
            ) AS public_privilege_count
            FROM pg_namespace AS namespace
           WHERE namespace.nspname = 'public'
        `;
        expect(schemaPrivileges).toEqual([
          {
            api_can_create: false,
            api_can_use: true,
            monitor_can_create: false,
            monitor_can_use: true,
            owner: "notify_migrator",
            public_privilege_count: 0,
          },
        ]);

        const futureObjectPrivileges = await connection<
          {
            api_can_execute_function: boolean;
            api_can_read_table: boolean;
            api_can_use_sequence: boolean;
            monitor_can_insert_table: boolean;
          }[]
        >`
          SELECT
            has_table_privilege(
              'notify_api',
              'public.m0_bootstrap_default_acl_table_probe',
              'SELECT'
            ) AS api_can_read_table,
            has_table_privilege(
              'notify_monitor',
              'public.m0_bootstrap_default_acl_table_probe',
              'INSERT'
            ) AS monitor_can_insert_table,
            has_function_privilege(
              'notify_api',
              'public.m0_bootstrap_default_acl_function_probe()',
              'EXECUTE'
            ) AS api_can_execute_function,
            has_sequence_privilege(
              'notify_api',
              'public.m0_bootstrap_default_acl_table_probe_id_seq',
              'USAGE'
            ) AS api_can_use_sequence
        `;
        expect(futureObjectPrivileges).toEqual([
          {
            api_can_execute_function: false,
            api_can_read_table: false,
            api_can_use_sequence: false,
            monitor_can_insert_table: false,
          },
        ]);

        const unexpectedDefaultPrivileges = await connection<
          { count: number }[]
        >`
          SELECT count(*)::int AS count
            FROM pg_default_acl AS defaults
            LEFT JOIN pg_namespace AS namespace
              ON namespace.oid = defaults.defaclnamespace
            CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS privilege
            LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
           WHERE defaults.defaclrole = 'notify_migrator'::regrole
             AND defaults.defaclobjtype IN ('r', 'S', 'f')
             AND (
               defaults.defaclnamespace = 0
               OR namespace.nspname = 'public'
             )
             AND (
               privilege.grantee = 0
               OR grantee.rolname IN ('notify_api', 'notify_monitor')
             )
        `;
        expect(unexpectedDefaultPrivileges).toEqual([{ count: 0 }]);

        const memberships = await connection<
          { granted_role: string; member_role: string }[]
        >`
          SELECT
            granted_role.rolname AS granted_role,
            member_role.rolname AS member_role
            FROM pg_auth_members AS membership
            JOIN pg_roles AS granted_role
              ON granted_role.oid = membership.roleid
            JOIN pg_roles AS member_role ON member_role.oid = membership.member
           WHERE granted_role.rolname = ANY(${connection.array([
                   "notify_migrator",
                   "notify_api",
                   "notify_monitor",
                 ])})
              OR member_role.rolname = ANY(${connection.array([
                   "notify_migrator",
                   "notify_api",
                   "notify_monitor",
                 ])})
              OR (
                granted_role.rolname = 'm0_bootstrap_membership_probe'
                AND member_role.rolname = 'm0_bootstrap_membership_downstream'
              )
           ORDER BY granted_role, member_role
        `;
        expect(memberships).toEqual([]);

        const extensionPrivileges = await connection<
          {
            api_can_digest: boolean;
            monitor_can_digest: boolean;
            public_can_digest: boolean;
            public_can_procedure: boolean;
          }[]
        >`
          SELECT
            has_function_privilege(
              'notify_api',
              'public.digest(bytea,text)',
              'EXECUTE'
            ) AS api_can_digest,
            has_function_privilege(
              'notify_monitor',
              'public.digest(bytea,text)',
              'EXECUTE'
            ) AS monitor_can_digest,
            has_function_privilege(
              'public',
              'public.digest(bytea,text)',
              'EXECUTE'
            ) AS public_can_digest,
            has_function_privilege(
              'public',
              'public.m0_bootstrap_public_procedure_probe()',
              'EXECUTE'
            ) AS public_can_procedure
        `;
        expect(extensionPrivileges).toEqual([
          {
            api_can_digest: false,
            monitor_can_digest: false,
            public_can_digest: false,
            public_can_procedure: false,
          },
        ]);
      } finally {
        await connection.unsafe("ROLLBACK");
      }
    } finally {
      connection.release();
    }
  });

  it("normalizes migrator default privileges before a local reset", async () => {
    const connection = await bootstrap.reserve();
    try {
      await connection.unsafe("BEGIN");
      try {
        await connection.unsafe(`
          SET ROLE notify_migrator;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator
            GRANT ALL ON TABLES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator
            GRANT ALL ON SEQUENCES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator
            GRANT EXECUTE ON FUNCTIONS TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator IN SCHEMA public
            GRANT ALL ON TABLES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator IN SCHEMA public
            GRANT ALL ON SEQUENCES TO PUBLIC, notify_api, notify_monitor;
          ALTER DEFAULT PRIVILEGES FOR ROLE notify_migrator IN SCHEMA public
            GRANT EXECUTE ON FUNCTIONS TO PUBLIC, notify_api, notify_monitor;
          RESET ROLE;
          SET ROLE notify_migrator;
        `);
        await connection.unsafe(MIGRATOR_DEFAULT_PRIVILEGES_RESET_SQL);
        await connection.unsafe(`
          CREATE TABLE public.m0_reset_default_acl_table_probe (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
          );
          CREATE FUNCTION public.m0_reset_default_acl_function_probe()
          RETURNS integer
          LANGUAGE sql
          AS 'SELECT 1';
          RESET ROLE;
        `);

        const privileges = await connection<
          {
            api_can_execute_function: boolean;
            api_can_read_table: boolean;
            api_can_use_sequence: boolean;
            monitor_can_execute_function: boolean;
            monitor_can_read_table: boolean;
            monitor_can_use_sequence: boolean;
            public_can_execute_function: boolean;
            public_can_read_table: boolean;
            public_can_use_sequence: boolean;
          }[]
        >`
          SELECT
            has_table_privilege(
              'public',
              'public.m0_reset_default_acl_table_probe',
              'SELECT'
            ) AS public_can_read_table,
            has_table_privilege(
              'notify_api',
              'public.m0_reset_default_acl_table_probe',
              'SELECT'
            ) AS api_can_read_table,
            has_table_privilege(
              'notify_monitor',
              'public.m0_reset_default_acl_table_probe',
              'SELECT'
            ) AS monitor_can_read_table,
            has_sequence_privilege(
              'public',
              'public.m0_reset_default_acl_table_probe_id_seq',
              'USAGE'
            ) AS public_can_use_sequence,
            has_sequence_privilege(
              'notify_api',
              'public.m0_reset_default_acl_table_probe_id_seq',
              'USAGE'
            ) AS api_can_use_sequence,
            has_sequence_privilege(
              'notify_monitor',
              'public.m0_reset_default_acl_table_probe_id_seq',
              'USAGE'
            ) AS monitor_can_use_sequence,
            has_function_privilege(
              'public',
              'public.m0_reset_default_acl_function_probe()',
              'EXECUTE'
            ) AS public_can_execute_function,
            has_function_privilege(
              'notify_api',
              'public.m0_reset_default_acl_function_probe()',
              'EXECUTE'
            ) AS api_can_execute_function,
            has_function_privilege(
              'notify_monitor',
              'public.m0_reset_default_acl_function_probe()',
              'EXECUTE'
            ) AS monitor_can_execute_function
        `;
        expect(privileges).toEqual([
          {
            api_can_execute_function: false,
            api_can_read_table: false,
            api_can_use_sequence: false,
            monitor_can_execute_function: false,
            monitor_can_read_table: false,
            monitor_can_use_sequence: false,
            public_can_execute_function: false,
            public_can_read_table: false,
            public_can_use_sequence: false,
          },
        ]);
      } finally {
        await connection.unsafe("ROLLBACK");
      }
    } finally {
      connection.release();
    }
  });

  it("denies PUBLIC execution on functions created by future migrations", async () => {
    const defaultPrivileges = await migrator<
      {
        is_global: boolean;
        owner_can_execute: boolean;
        public_can_execute: boolean;
      }[]
    >`
      SELECT
        defaults.defaclnamespace = 0 AS is_global,
        bool_or(
          privileges.grantee = 'notify_migrator'::regrole
          AND privileges.privilege_type = 'EXECUTE'
        ) AS owner_can_execute,
        bool_or(
          privileges.grantee = 0
          AND privileges.privilege_type = 'EXECUTE'
        ) AS public_can_execute
      FROM pg_default_acl AS defaults
      CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS privileges
      WHERE defaults.defaclrole = 'notify_migrator'::regrole
        AND defaults.defaclobjtype = 'f'
      GROUP BY defaults.defaclnamespace
    `;
    expect(defaultPrivileges).toEqual([
      {
        is_global: true,
        owner_can_execute: true,
        public_can_execute: false,
      },
    ]);

    // Reserved connection + BEGIN/ROLLBACK, not autocommitted DDL: this
    // database is shared, and a leaked probe function would poison every
    // later run.
    const connection = await migrator.reserve();
    try {
      await connection.unsafe("BEGIN");
      try {
        await connection.unsafe(`
          CREATE FUNCTION public.m0_default_acl_probe()
          RETURNS integer
          LANGUAGE sql
          AS 'SELECT 1'
        `);
        const rows = await connection<{ public_can_execute: boolean }[]>`
          SELECT has_function_privilege(
            'public',
            'public.m0_default_acl_probe()',
            'EXECUTE'
          ) AS public_can_execute
        `;
        expect(rows).toEqual([{ public_can_execute: false }]);
      } finally {
        await connection.unsafe("ROLLBACK");
      }
    } finally {
      connection.release();
    }
  });

  it("has the exact immutable migration ledger and seed catalog", async () => {
    const migrationRows = await migrator<
      { createdAt: string; hash: string }[]
    >`
      SELECT hash, created_at::text AS "createdAt"
        FROM public.__drizzle_migrations
       ORDER BY id
    `;
    const checkedInMigrations = readMigrationFiles({
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: "public",
      migrationsTable: "__drizzle_migrations",
    });
    assertMigrationLedgerIntegrity(checkedInMigrations, migrationRows);
    expect(migrationRows).toHaveLength(7);

    const products = await migrator<
      {
        slug: string;
        name: string;
        default_alert_price_cents: number;
        is_suggested: boolean;
        suggested_rank: number | null;
        poll_interval_seconds: number;
      }[]
    >`
      SELECT
        slug,
        name,
        default_alert_price_cents,
        is_suggested,
        suggested_rank,
        poll_interval_seconds
      FROM products
      ORDER BY suggested_rank NULLS LAST, slug
    `;

    expect(products).toHaveLength(SEED_PRODUCTS.length);
    for (const seedProduct of SEED_PRODUCTS) {
      const actual = products.find((product) => product.slug === seedProduct.slug);
      expect(actual).toMatchObject({
        name: seedProduct.name,
        default_alert_price_cents: seedProduct.defaultAlertPriceCents,
        is_suggested: seedProduct.suggestedRank !== null,
        suggested_rank: seedProduct.suggestedRank,
        poll_interval_seconds: seedProduct.suggestedRank === null ? 60 : 15,
      });
    }

    const fakeOfferRows = await migrator<{ count: string }[]>`
      SELECT count(*)::text AS count
        FROM fake_offers
       WHERE NOT purchasable
         AND best_price_cents IS null
    `;
    const { count: fakeOfferCount } = firstRow(fakeOfferRows);
    expect(Number(fakeOfferCount)).toBe(SEED_PRODUCTS.length);
  });

  it("creates preferences and trigger state through security-definer triggers", async () => {
    // `userId`/`alertId` are declared outside the `try` and guarded in
    // `finally` so a failed insert mid-fixture can never send `undefined`
    // into a cleanup query, and so a user created just before a later
    // insert fails is still cleaned up.
    let userId: string | undefined;
    let alertId: string | undefined;
    try {
      const email = `m0-${nextFixtureSuffix()}@example.test`;
      const userRows = await api<{ id: string }[]>`
        INSERT INTO users (name, email)
        VALUES (${email}, ${email})
        RETURNING id
      `;
      userId = firstRow(userRows).id;
      const productRows = await api<{ id: string }[]>`
        SELECT id FROM products ORDER BY slug LIMIT 1
      `;
      const { id: productId } = firstRow(productRows);
      const alertRows = await api<{ id: string }[]>`
        INSERT INTO alerts (user_id, product_id, price_threshold_cents)
        VALUES (${userId}, ${productId}, 5499)
        RETURNING id
      `;
      alertId = firstRow(alertRows).id;

      const preferences = await api<
        { notifications_enabled: boolean; plan: string }[]
      >`
        SELECT notifications_enabled, plan
          FROM user_preferences
         WHERE user_id = ${userId}
      `;
      expect(preferences).toEqual([{ notifications_enabled: true, plan: "free" }]);

      const triggerState = await migrator<
        { armed: boolean; consecutive_eligible: number }[]
      >`
        SELECT armed, consecutive_eligible
          FROM alert_trigger_state
         WHERE alert_id = ${alertId}
      `;
      expect(triggerState).toEqual([{ armed: true, consecutive_eligible: 0 }]);
    } finally {
      if (alertId !== undefined) {
        await migrator`DELETE FROM alerts WHERE id = ${alertId}`;
      }
      if (userId !== undefined) {
        await api`DELETE FROM users WHERE id = ${userId}`;
      }
    }
  });

  it("enforces the API role boundary", async () => {
    await api`SELECT id, slug FROM products LIMIT 1`;
    await api`SELECT public.gen_random_uuid()`;
    await expectPermissionDenied(async () => api`SELECT * FROM fake_offers LIMIT 1`);
    await expectPermissionDenied(async () => api`SELECT * FROM alert_trigger_state LIMIT 1`);
    await expectPermissionDenied(async () => api`SELECT * FROM proxy_endpoints LIMIT 1`);
    await expectPermissionDenied(
      async () => api`UPDATE alerts SET user_id = user_id WHERE false`,
    );
    await expectPermissionDenied(
      async () => api`UPDATE user_preferences SET plan = plan WHERE false`,
    );
    await expectPermissionDenied(async () => api`DELETE FROM alerts WHERE false`);
    await expectPermissionDenied(
      async () =>
        api`SELECT public.fire_alert('00000000-0000-0000-0000-000000000000', 'm0', 100, 30)`,
    );
    await expectPermissionDenied(
      async () => api.unsafe("CREATE TABLE public.m0_api_forbidden (id int)"),
    );
    await expectPermissionDenied(
      async () => api`SELECT public.digest('notify', 'sha256')`,
    );
    await expectPermissionDenied(
      async () => api`SELECT created_at FROM realtime_tickets WHERE false`,
    );
  });

  it("enforces the monitor role boundary while allowing fire_alert", async () => {
    await monitor`SELECT id, slug FROM products LIMIT 1`;
    await monitor`SELECT public.gen_random_uuid()`;
    const eventRows = await monitor<{ event_id: string | null }[]>`
      SELECT public.fire_alert(
        '00000000-0000-0000-0000-000000000000',
        'm0',
        100,
        30
      ) AS event_id
    `;
    const { event_id: eventId } = firstRow(eventRows);
    expect(eventId).toBeNull();

    await expectPermissionDenied(async () => monitor`SELECT * FROM sessions LIMIT 1`);
    await expectPermissionDenied(async () => monitor`SELECT password FROM accounts LIMIT 1`);
    await expectPermissionDenied(
      async () => monitor.unsafe("CREATE TABLE public.m0_monitor_forbidden (id int)"),
    );
    await expectPermissionDenied(
      async () => monitor`SELECT public.digest('notify', 'sha256')`,
    );
    await expectPermissionDenied(
      async () => monitor`SELECT ticket_hash FROM realtime_tickets WHERE false`,
    );
  });

  it("raises instead of firing when any fire_alert argument is null", async () => {
    // D32: a null price or cooldown makes its comparison null, which reads as false, so
    // an alert that should have been throttled fires or one that should fire never does.
    // notify_monitor is the only role holding EXECUTE, so calling through `api` here
    // would fail with 42501 before the guard ever ran.
    await expectFireAlertNullGuard(
      async () => monitor`SELECT public.fire_alert(null::uuid, 'm0', 100, 30)`,
    );
    await expectFireAlertNullGuard(
      async () =>
        monitor`
          SELECT public.fire_alert(
            '00000000-0000-0000-0000-000000000000',
            null::text,
            100,
            30
          )
        `,
    );
    await expectFireAlertNullGuard(
      async () =>
        monitor`
          SELECT public.fire_alert(
            '00000000-0000-0000-0000-000000000000',
            'm0',
            null::int,
            30
          )
        `,
    );
    await expectFireAlertNullGuard(
      async () =>
        monitor`
          SELECT public.fire_alert(
            '00000000-0000-0000-0000-000000000000',
            'm0',
            100,
            null::int
          )
        `,
    );
  });

  it("allows the planned realtime ticket lifecycle under runtime roles", async () => {
    const email = `m0-ticket-${nextFixtureSuffix()}@example.test`;
    const userRows = await api<{ id: string }[]>`
      INSERT INTO users (name, email)
      VALUES (${email}, ${email})
      RETURNING id
    `;
    const { id: userId } = firstRow(userRows);
    const userHashPrefix = userId.replaceAll("-", "");
    const staleHash = `${userHashPrefix}${"00".repeat(16)}`;
    const liveHash = `${userHashPrefix}${"11".repeat(16)}`;
    const expiredHash = `${userHashPrefix}${"22".repeat(16)}`;

    try {
      await api`
        INSERT INTO realtime_tickets (ticket_hash, user_id, expires_at)
        VALUES (decode(${staleHash}, 'hex'), ${userId}, now() - interval '1 minute')
      `;
      const staleRows = await api<{ user_id: string }[]>`
        DELETE FROM realtime_tickets
         WHERE user_id = ${userId}
           AND (expires_at <= now() OR consumed_at IS NOT NULL)
        RETURNING user_id
      `;
      expect(staleRows).toEqual([{ user_id: userId }]);

      await api`
        INSERT INTO realtime_tickets (ticket_hash, user_id, expires_at)
        VALUES (decode(${liveHash}, 'hex'), ${userId}, now() + interval '1 minute')
      `;
      const consumedRows = await api<{ user_id: string }[]>`
        UPDATE realtime_tickets
           SET consumed_at = now()
         WHERE ticket_hash = decode(${liveHash}, 'hex')
           AND consumed_at IS NULL
           AND expires_at > now()
        RETURNING user_id
      `;
      expect(consumedRows).toEqual([{ user_id: userId }]);

      await api`
        INSERT INTO realtime_tickets (ticket_hash, user_id, expires_at)
        VALUES (decode(${expiredHash}, 'hex'), ${userId}, now() - interval '1 minute')
      `;
      // This DELETE must stay unscoped: it runs on the `monitor` connection,
      // and `notify_monitor` holds SELECT (expires_at, consumed_at) only on
      // realtime_tickets, matching section 6.3 — adding `AND user_id = ...`
      // raises 42501 (measured). This is the section 6.3 maintenance query
      // under test; the FK cascade on user deletion removes this user's
      // tickets regardless of what this scheduled sweep catches.
      await monitor`
        DELETE FROM realtime_tickets
         WHERE expires_at <= now()
            OR consumed_at IS NOT NULL
      `;

      const remainingRows = await migrator<{ count: string }[]>`
        SELECT count(*)::text AS count
          FROM realtime_tickets
         WHERE user_id = ${userId}
      `;
      expect(remainingRows).toEqual([{ count: "0" }]);
    } finally {
      await migrator`DELETE FROM users WHERE id = ${userId}`;
    }
  });

  it("enforces every section 6.3 grant exactly, per column, for notify_api, notify_monitor, and public", async () => {
    const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE"] as const;
    const TABLE_PRIVILEGES = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
    const MATRIX_ROLES = ["notify_api", "notify_monitor", "public"] as const;

    for (const role of MATRIX_ROLES) {
      const columnRows = await migrator<
        { table_name: string; column_name: string; privilege: string; actual: boolean }[]
      >`
        SELECT
          columns.table_name,
          columns.column_name,
          privilege.name AS privilege,
          has_column_privilege(
            ${role},
            columns.table_name,
            columns.column_name,
            privilege.name
          ) AS actual
          FROM information_schema.columns AS columns
          CROSS JOIN unnest(${migrator.array([...COLUMN_PRIVILEGES])}) AS privilege(name)
         WHERE columns.table_schema = 'public'
           AND columns.table_name = ANY(${migrator.array([...expectedTables])})
      `;
      const unexpectedColumnPrivileges = columnRows.filter(
        (row) =>
          row.actual !==
          expectedColumnPrivilege(
            row.table_name,
            role,
            row.column_name,
            row.privilege as ColumnPrivilege,
          ),
      );
      expect(unexpectedColumnPrivileges).toEqual([]);

      const tableRows = await migrator<
        { table_name: string; privilege: string; actual: boolean }[]
      >`
        SELECT
          tables.name AS table_name,
          privilege.name AS privilege,
          has_table_privilege(${role}, tables.name, privilege.name) AS actual
          FROM unnest(${migrator.array([...expectedTables])}) AS tables(name)
          CROSS JOIN unnest(${migrator.array([...TABLE_PRIVILEGES])}) AS privilege(name)
      `;
      const unexpectedTablePrivileges = tableRows.filter(
        (row) =>
          row.actual !==
          expectedTablePrivilege(row.table_name, role, row.privilege as TablePrivilege),
      );
      expect(unexpectedTablePrivileges).toEqual([]);
    }
  });

  it("keeps the section 6.3 grant matrix in sync with the table inventory", () => {
    // Deliberately compared to `expectedTables`, not the catalog: `public`
    // holds 21 base tables including `__drizzle_migrations`. The existing
    // "contains the complete table... inventory" test above already keeps
    // `expectedTables` in sync with the catalog, so together the two tests
    // mean a new `public` table cannot ship without both a catalog entry and
    // a grant matrix row.
    expect(Object.keys(GRANT_MATRIX).sort()).toEqual([...expectedTables].sort());
  });

  it("locks every function, trigger, constraint, and index to its exact catalog definition", async () => {
    const functionRows = await migrator<
      { function_name: string; prosecdef: boolean; proconfig: string[] | null }[]
    >`
      SELECT
        procedure.oid::regprocedure::text AS function_name,
        procedure.prosecdef,
        procedure.proconfig
        FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname = ANY(${migrator.array([...expectedFunctions])})
       ORDER BY function_name
    `;
    expect(functionRows).toEqual(expectedFunctionTuples);

    const triggerRows = await migrator<
      { trigger_name: string; table_name: string; definition: string }[]
    >`
      SELECT
        trigger.tgname AS trigger_name,
        relation.relname AS table_name,
        pg_get_triggerdef(trigger.oid) AS definition
        FROM pg_trigger AS trigger
        JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND NOT trigger.tgisinternal
       ORDER BY trigger.tgname
    `;
    expect(triggerRows).toEqual(expectedTriggerDefinitions);

    const constraintRows = await migrator<
      { constraint_name: string; table_name: string; contype: string; confdeltype: string }[]
    >`
      SELECT
        constraint_row.conname AS constraint_name,
        relation.relname AS table_name,
        constraint_row.contype,
        constraint_row.confdeltype
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND constraint_row.contype IN ('u', 'f')
       ORDER BY relation.relname, constraint_row.conname
    `;
    expect(constraintRows).toEqual(expectedUniqueAndForeignKeyConstraints);

    const indexRows = await migrator<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY(${migrator.array([...expectedIndexes])})
       ORDER BY indexname
    `;
    expect(indexRows).toEqual(
      expectedIndexes.map((indexname) => ({
        indexname,
        indexdef: expectedIndexDefinitions[indexname],
      })),
    );
  });

  describe("fire_alert and the realtime trigger set (D6, D22, D23, D35)", () => {
    type RealtimePayload = { v: number; userId: string; type: string; entityId: string };

    const ORIGINAL_THRESHOLD_CENTS = 5000;
    // Declared as `string | undefined`, not `string`: `beforeEach` assigns
    // these one statement at a time, so a failure partway through (or on its
    // very first INSERT) leaves one or more unset. `afterEach` still runs
    // after a failed `beforeEach`, and without the guard below it would send
    // `undefined` into `DELETE FROM users WHERE id = ${userId}`, which
    // postgres.js rejects with "Undefined values are not allowed" — masking
    // the real failure. Same hazard, same fix, as the guarded fixtures at
    // "creates preferences and trigger state..." and
    // "re-touches alerts.updated_at..." above.
    let userId: string | undefined;
    let alertId: string | undefined;
    let secondProductId: string | undefined;

    // Narrows the three fixture fields for use inside an `it()` body, which
    // runs in a different closure than the `beforeEach` that assigns them,
    // so TypeScript cannot narrow `string | undefined` to `string` there on
    // its own. Only reachable once `beforeEach` has completed successfully —
    // vitest does not run a test body after its `beforeEach` throws.
    function requireFireAlertFixture(): {
      userId: string;
      alertId: string;
      secondProductId: string;
    } {
      if (userId === undefined || alertId === undefined || secondProductId === undefined) {
        throw new Error("Expected beforeEach to have created the fire_alert fixture.");
      }
      return { userId, alertId, secondProductId };
    }

    // `notify_migrator` cannot `SET ROLE notify_monitor` (no `pg_auth_members`
    // row), and `notify_monitor` cannot insert these fixtures, so they are
    // created through `notify_api` and committed rather than rolled back.
    // `fire_alert` is then called on the dedicated `monitor` connection.
    beforeEach(async () => {
      const [firstSeedProduct, secondSeedProduct] = SEED_PRODUCTS;
      if (firstSeedProduct === undefined || secondSeedProduct === undefined) {
        throw new Error("Expected at least two seed products for this fixture.");
      }
      const suffix = nextFixtureSuffix();
      const email = `m0-fire-alert-${suffix}@example.test`;
      const userRows = await api<{ id: string }[]>`
        INSERT INTO users (name, email) VALUES (${email}, ${email}) RETURNING id
      `;
      userId = firstRow(userRows).id;

      const firstProductRows = await api<{ id: string }[]>`
        SELECT id FROM products WHERE slug = ${firstSeedProduct.slug}
      `;
      const { id: firstProductId } = firstRow(firstProductRows);
      const secondProductRows = await api<{ id: string }[]>`
        SELECT id FROM products WHERE slug = ${secondSeedProduct.slug}
      `;
      secondProductId = firstRow(secondProductRows).id;

      const alertRows = await api<{ id: string }[]>`
        INSERT INTO alerts (user_id, product_id, price_threshold_cents)
        VALUES (${userId}, ${firstProductId}, ${ORIGINAL_THRESHOLD_CENTS})
        RETURNING id
      `;
      alertId = firstRow(alertRows).id;

      await api`
        INSERT INTO push_tokens (user_id, platform, expo_push_token)
        VALUES (${userId}, 'ios', ${`m0-fire-alert-${suffix}`})
      `;
    });

    afterEach(async () => {
      // Guarded: see the declaration comment above for why `userId` can be
      // unset here.
      if (userId !== undefined) {
        // The FK cascade removes the alert(s), trigger state, recent
        // events, deliveries, preferences, push token, and any realtime
        // tickets.
        await migrator`DELETE FROM users WHERE id = ${userId}`;
      }
    });

    it("fires once, refuses an immediate repeat, disarms, and delivers exactly once", async () => {
      const { alertId } = requireFireAlertFixture();
      const triggerKey = freshTriggerKey();
      const eventId = await callFireAlert(alertId, triggerKey, 4500);
      expect(eventId).not.toBeNull();

      expect(await callFireAlert(alertId, triggerKey, 4500)).toBeNull();
      expect((await readAlertTriggerState(alertId)).armed).toBe(false);

      const deliveryRows = await migrator<{ count: string }[]>`
        SELECT count(*)::text AS count
          FROM notification_deliveries
         WHERE event_id = ${eventId}
      `;
      expect(firstRow(deliveryRows).count).toBe("1");
    });

    it("refuses a disarmed alert even once its cooldown has long expired (the armed gate)", async () => {
      const { alertId } = requireFireAlertFixture();
      // Without this assertion, a `fire_alert` with `OR NOT v_state.armed`
      // removed would pass every other assertion in this describe block.
      await migrator`
        UPDATE alert_trigger_state
           SET armed = false, last_triggered_at = now() - interval '2 hours'
         WHERE alert_id = ${alertId}
      `;
      expect(await callFireAlert(alertId, freshTriggerKey(), 4500)).toBeNull();
    });

    it("refuses inside the cooldown window even when armed", async () => {
      const { alertId } = requireFireAlertFixture();
      await migrator`
        UPDATE alert_trigger_state
           SET armed = true, last_triggered_at = now()
         WHERE alert_id = ${alertId}
      `;
      expect(await callFireAlert(alertId, freshTriggerKey(), 4500)).toBeNull();
    });

    it("refuses above the current threshold without disarming (D23's stale-price race)", async () => {
      const { alertId } = requireFireAlertFixture();
      await migrator`
        UPDATE alert_trigger_state
           SET armed = true, last_triggered_at = null
         WHERE alert_id = ${alertId}
      `;
      expect(
        await callFireAlert(alertId, freshTriggerKey(), ORIGINAL_THRESHOLD_CENTS + 500),
      ).toBeNull();
      // A separate statement, deliberately not a same-statement subquery: a
      // subquery would share this call's own snapshot and could not observe
      // a write fire_alert never made.
      expect((await readAlertTriggerState(alertId)).armed).toBe(true);
    });

    it("is idempotent when a trigger key is reused", async () => {
      const { alertId } = requireFireAlertFixture();
      const triggerKey = freshTriggerKey();
      expect(await callFireAlert(alertId, triggerKey, 4500)).not.toBeNull();

      await migrator`
        UPDATE alert_trigger_state
           SET armed = true, last_triggered_at = null
         WHERE alert_id = ${alertId}
      `;
      expect(await callFireAlert(alertId, triggerKey, 4500)).toBeNull();
      expect((await readAlertTriggerState(alertId)).armed).toBe(true);

      const recentEventRows = await migrator<{ count: string }[]>`
        SELECT count(*)::text AS count FROM recent_events WHERE alert_id = ${alertId}
      `;
      expect(firstRow(recentEventRows).count).toBe("1");
    });

    it("re-arms only on a real alert change, never a no-op save (D35)", async () => {
      const { alertId } = requireFireAlertFixture();
      expect(await callFireAlert(alertId, freshTriggerKey(), 4500)).not.toBeNull();

      const afterFire = await readAlertTriggerState(alertId);
      expect(afterFire.armed).toBe(false);
      expect(afterFire.last_triggered_at).not.toBeNull();

      await api`
        UPDATE alerts
           SET price_threshold_cents = ${ORIGINAL_THRESHOLD_CENTS}, status = 'active'
         WHERE id = ${alertId}
      `;
      const afterNoOpSave = await readAlertTriggerState(alertId);
      expect(afterNoOpSave.armed).toBe(false);
      expect(afterNoOpSave.last_triggered_at).not.toBeNull();

      await api`
        UPDATE alerts
           SET price_threshold_cents = ${ORIGINAL_THRESHOLD_CENTS - 1000}, status = 'active'
         WHERE id = ${alertId}
      `;
      const afterRealChange = await readAlertTriggerState(alertId);
      expect(afterRealChange.armed).toBe(true);
      expect(afterRealChange.last_triggered_at).toBeNull();
    });

    it("delivers realtime notifications for alerts, recent_events, and user_preferences changes", async () => {
      const { userId, alertId, secondProductId } = requireFireAlertFixture();
      const receivedPayloads: RealtimePayload[] = [];
      // `sql.listen` opens its own dedicated connection; a manual `LISTEN`
      // issued through `.unsafe()` on a reserved connection is never
      // dispatched to a JS handler (measured: 0 payloads received).
      const subscription = await migrator.listen("notify_realtime", (payload) => {
        receivedPayloads.push(JSON.parse(payload) as RealtimePayload);
      });
      try {
        // `alerts_one_active_per_product` forbids a second live alert on the
        // fixture's product, so this insert targets the second seeded
        // product instead (measured 23505 against the fixture's product).
        const secondAlertRows = await api<{ id: string }[]>`
          INSERT INTO alerts (user_id, product_id, price_threshold_cents)
          VALUES (${userId}, ${secondProductId}, ${ORIGINAL_THRESHOLD_CENTS})
          RETURNING id
        `;
        const { id: secondAlertId } = firstRow(secondAlertRows);

        const recentEventRows = await migrator<{ id: string }[]>`
          INSERT INTO recent_events (user_id, alert_id, product_id, price_cents, trigger_key)
          VALUES (${userId}, ${alertId}, ${secondProductId}, 4500, ${freshTriggerKey()})
          RETURNING id
        `;
        const { id: recentEventId } = firstRow(recentEventRows);

        await api`
          UPDATE user_preferences SET notifications_enabled = false WHERE user_id = ${userId}
        `;

        // Notifications deliver only at commit, so this polls rather than
        // asserting immediately after the awaited inserts above.
        await vi.waitFor(
          () => {
            if (receivedPayloads.length < 3) {
              throw new Error(
                `Expected 3 realtime payloads, received ${String(receivedPayloads.length)}.`,
              );
            }
          },
          { timeout: 4000, interval: 25 },
        );

        for (const payload of receivedPayloads) {
          expect(Object.keys(payload).sort()).toEqual(["entityId", "type", "userId", "v"]);
        }

        expect(
          receivedPayloads.find((payload) => payload.type === "alerts.changed"),
        ).toMatchObject({
          v: 1,
          userId,
          type: "alerts.changed",
          entityId: secondAlertId,
        });
        expect(
          receivedPayloads.find((payload) => payload.type === "recent.created"),
        ).toMatchObject({
          v: 1,
          userId,
          type: "recent.created",
          entityId: recentEventId,
        });
        expect(
          receivedPayloads.find((payload) => payload.type === "preferences.changed"),
        ).toMatchObject({
          v: 1,
          userId,
          type: "preferences.changed",
          entityId: userId,
        });
      } finally {
        await subscription.unlisten();
      }
    });

    // The D39 regression test. Before migration 0005 the only row lock
    // `fire_alert` took was on `alert_trigger_state`, and `deleted_at` is in no
    // trigger's column list, so an in-flight soft delete was invisible: the call
    // fired a phantom event for an alert the customer had just deleted instead
    // of waiting for it. Measured on that function: no 55P03, an event returned,
    // a delivery queued.
    it("refuses to fire while a soft delete of the same alert is in flight (D39)", async () => {
      const { alertId } = requireFireAlertFixture();
      await whileSoftDeleteIsInFlight(alertId, async () => {
        await expectFireAlertToBlock(alertId, 4500);
      });

      // 55P03 aborts the whole function — it is one statement in one
      // transaction — so there is no partial write to find here.
      const eventRows = await migrator<{ count: string }[]>`
        SELECT count(*)::text AS count FROM recent_events WHERE alert_id = ${alertId}
      `;
      expect(firstRow(eventRows).count).toBe("0");
    });

    // A behavior pin rather than a regression test: the `INSERT ... SELECT`
    // already refused a COMMITTED soft delete before migration 0005. It is here
    // so the locked guard that now decides this case cannot silently change what
    // the caller and the trigger state see.
    it("refuses a committed soft delete and leaves trigger state untouched (D39)", async () => {
      const { alertId } = requireFireAlertFixture();
      await api`UPDATE alerts SET deleted_at = now() WHERE id = ${alertId}`;

      expect(await callFireAlert(alertId, freshTriggerKey(), 4500)).toBeNull();

      const eventRows = await migrator<{ count: string }[]>`
        SELECT count(*)::text AS count FROM recent_events WHERE alert_id = ${alertId}
      `;
      expect(firstRow(eventRows).count).toBe("0");

      const deliveryRows = await migrator<{ count: string }[]>`
        SELECT count(*)::text AS count
          FROM notification_deliveries AS delivery
          JOIN recent_events AS event ON event.id = delivery.event_id
         WHERE event.alert_id = ${alertId}
      `;
      expect(firstRow(deliveryRows).count).toBe("0");

      // Still armed: a refused fire must never consume the alert's readiness.
      expect((await readAlertTriggerState(alertId)).armed).toBe(true);
    });

    it("terminates pending deliveries when a push token is re-registered to another user (D40)", async () => {
      const { userId, alertId } = requireFireAlertFixture();
      const eventId = await callFireAlert(alertId, freshTriggerKey(), 4500);
      if (eventId === null) {
        throw new Error("Expected fire_alert to queue the pending delivery this test terminates.");
      }
      const tokenRows = await migrator<{ expo_push_token: string }[]>`
        SELECT expo_push_token FROM push_tokens WHERE user_id = ${userId}
      `;
      const { expo_push_token: pushToken } = firstRow(tokenRows);
      expect(await readDeliveryOutcome(eventId)).toEqual({
        status: "pending",
        last_error: null,
      });

      // The account the token is handed to. `afterEach` deletes only the fixture
      // user, and once the token belongs to this second user it cascades from
      // this second user — so without the `finally` below, the token, this user,
      // and its preferences row would survive every run.
      const otherEmail = `m0-token-owner-${nextFixtureSuffix()}@example.test`;
      const otherUserRows = await api<{ id: string }[]>`
        INSERT INTO users (name, email) VALUES (${otherEmail}, ${otherEmail}) RETURNING id
      `;
      const { id: otherUserId } = firstRow(otherUserRows);

      try {
        // CONTROL: an unrelated column. The trigger watches `OF user_id`, so a
        // device merely reporting a new platform must change nothing. Without
        // this the test would pass against a trigger that fires on every write.
        await migrator`
          UPDATE push_tokens SET platform = 'android' WHERE expo_push_token = ${pushToken}
        `;
        expect(await readDeliveryOutcome(eventId)).toEqual({
          status: "pending",
          last_error: null,
        });

        // CONTROL: a same-owner re-registration. The WHEN clause requires the
        // owner to actually change, so a device refreshing its registration must
        // not lose its own queued push.
        await registerPushToken(pushToken, userId);
        expect(await readDeliveryOutcome(eventId)).toEqual({
          status: "pending",
          last_error: null,
        });

        // The production shape: the same upsert, now landing on another account.
        await registerPushToken(pushToken, otherUserId);
        expect(await readDeliveryOutcome(eventId)).toEqual({
          status: "failed",
          last_error: "owner_changed",
        });

        // The same guarantee for a bare `UPDATE`, which keeps the trigger pinned
        // to the column rather than to the upsert. The token goes back first and
        // the delivery is requeued second, so that hand-back cannot terminate
        // the row it is about to requeue.
        await migrator`
          UPDATE push_tokens SET user_id = ${userId} WHERE expo_push_token = ${pushToken}
        `;
        await migrator`
          UPDATE notification_deliveries
             SET status = 'pending', last_error = null
           WHERE event_id = ${eventId}
        `;
        await migrator`
          UPDATE push_tokens SET user_id = ${otherUserId} WHERE expo_push_token = ${pushToken}
        `;
        expect(await readDeliveryOutcome(eventId)).toEqual({
          status: "failed",
          last_error: "owner_changed",
        });
      } finally {
        await migrator`DELETE FROM users WHERE id = ${otherUserId}`;
      }
    });

    it("terminates pending deliveries when a push token is unregistered (D40)", async () => {
      const { userId, alertId } = requireFireAlertFixture();
      const eventId = await callFireAlert(alertId, freshTriggerKey(), 4500);
      if (eventId === null) {
        throw new Error("Expected fire_alert to queue the pending delivery this test terminates.");
      }
      expect(await readDeliveryOutcome(eventId)).toEqual({
        status: "pending",
        last_error: null,
      });

      // On `migrator`, the handle both D40 tests share: `notify_api` has no
      // SELECT on `notification_deliveries`, and `notify_monitor` has no UPDATE
      // on `push_tokens`, which the re-registration test above needs for its
      // upsert. `notify_monitor` *can* DELETE a push token and read the outbox
      // (both verified) — section 7.7's `DeviceNotRegistered` handler is exactly
      // that, so nothing here says the monitor cannot unregister a token.
      await migrator`DELETE FROM push_tokens WHERE user_id = ${userId}`;

      // `token_unregistered`, not `owner_changed`: the dominant cause of a
      // delete is the same owner removing their own device — including section
      // 7.7's `DeviceNotRegistered` handling — where nothing changed hands.
      expect(await readDeliveryOutcome(eventId)).toEqual({
        status: "failed",
        last_error: "token_unregistered",
      });
    });
  });

  it("re-touches alerts.updated_at through set_updated_at on every UPDATE", async () => {
    let userId: string | undefined;
    let alertId: string | undefined;
    try {
      const email = `m0-touch-${nextFixtureSuffix()}@example.test`;
      const userRows = await api<{ id: string }[]>`
        INSERT INTO users (name, email) VALUES (${email}, ${email}) RETURNING id
      `;
      userId = firstRow(userRows).id;
      const productRows = await api<{ id: string }[]>`
        SELECT id FROM products ORDER BY slug LIMIT 1
      `;
      const { id: productId } = firstRow(productRows);

      // Age `updated_at` at INSERT time, never with a later UPDATE:
      // `alerts_touch` is BEFORE UPDATE and unconditionally overwrites
      // `new.updated_at = now()`, so an aging UPDATE is a measured no-op —
      // the row would never actually be old by the time it is read back.
      // The hour-scale gap also avoids comparing two adjacent statements'
      // millisecond-resolution timestamps directly, which is ~70% flaky.
      const insertedRows = await api<{ id: string; updated_at: Date }[]>`
        INSERT INTO alerts (user_id, product_id, price_threshold_cents, updated_at)
        VALUES (${userId}, ${productId}, 5000, now() - interval '1 hour')
        RETURNING id, updated_at
      `;
      const inserted = firstRow(insertedRows);
      alertId = inserted.id;
      expect(Date.now() - inserted.updated_at.getTime()).toBeGreaterThan(55 * 60 * 1000);

      await api`UPDATE alerts SET price_threshold_cents = 5100 WHERE id = ${alertId}`;

      const touchedRows = await migrator<{ updated_at: Date }[]>`
        SELECT updated_at FROM alerts WHERE id = ${alertId}
      `;
      expect(Date.now() - firstRow(touchedRows).updated_at.getTime()).toBeLessThan(60 * 1000);
    } finally {
      if (alertId !== undefined) {
        await migrator`DELETE FROM alerts WHERE id = ${alertId}`;
      }
      if (userId !== undefined) {
        await api`DELETE FROM users WHERE id = ${userId}`;
      }
    }
  });

  it("rejects reset URLs outside the local Notify database", () => {
    expect(() => assertLocalResetUrl(LOCAL_MIGRATION_URL)).not.toThrow();
    expect(() =>
      assertLocalResetUrl("postgresql://notify_migrator:secret@db.example.com/notify"),
    ).toThrow(/local\/test-only/);
    expect(() =>
      assertLocalResetUrl("postgresql://notify_migrator:secret@localhost/customer_data"),
    ).toThrow(/local\/test-only/);
    expect(() =>
      assertLocalResetUrl("postgresql://notify_migrator:secret@[::1]:54329/notify"),
    ).toThrow(/local\/test-only/);
  });
});
