import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  "rearm_alert",
  "set_updated_at",
] as const;

const expectedTriggers = [
  "alerts_realtime",
  "alerts_rearm",
  "alerts_touch",
  "on_auth_user_created",
  "prefs_touch",
  "recent_events_realtime",
  "user_preferences_realtime",
] as const;

const expectedIndexes = [
  "accounts_userId_idx",
  "alerts_by_product",
  "alerts_one_active_per_product",
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

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the query to return one row.");
  }
  return row;
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

    await migrator.unsafe(`
      CREATE FUNCTION public.m0_default_acl_probe()
      RETURNS integer
      LANGUAGE sql
      AS 'SELECT 1'
    `);
    try {
      const rows = await migrator<{ public_can_execute: boolean }[]>`
        SELECT has_function_privilege(
          'public',
          'public.m0_default_acl_probe()',
          'EXECUTE'
        ) AS public_can_execute
      `;
      expect(rows).toEqual([{ public_can_execute: false }]);
    } finally {
      await migrator.unsafe("DROP FUNCTION public.m0_default_acl_probe()");
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
    expect(migrationRows).toHaveLength(3);

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
    const email = `m0-${String(Date.now())}@example.test`;
    const userRows = await api<{ id: string }[]>`
      INSERT INTO users (name, email)
      VALUES (${email}, ${email})
      RETURNING id
    `;
    const { id: userId } = firstRow(userRows);
    const productRows = await api<{ id: string }[]>`
      SELECT id FROM products ORDER BY slug LIMIT 1
    `;
    const { id: productId } = firstRow(productRows);
    const alertRows = await api<{ id: string }[]>`
      INSERT INTO alerts (user_id, product_id, price_threshold_cents)
      VALUES (${userId}, ${productId}, 5499)
      RETURNING id
    `;
    const { id: alertId } = firstRow(alertRows);

    try {
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
      await migrator`DELETE FROM alerts WHERE id = ${alertId}`;
      await api`DELETE FROM users WHERE id = ${userId}`;
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

  it("allows the planned realtime ticket lifecycle under runtime roles", async () => {
    const email = `m0-ticket-${String(Date.now())}@example.test`;
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
