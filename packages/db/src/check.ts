import postgres from "postgres";

import { migrationDatabaseUrl, runtimeProcess } from "./environment.ts";
import { verifySeedDatabase } from "./seed-operations.ts";

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

const client = postgres(migrationDatabaseUrl(), {
  max: 1,
  onnotice: () => undefined,
});

try {
  const rows = await client<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
  `;
  const actual = new Set(rows.map((row) => row.table_name));
  const missing = expectedTables.filter((table) => !actual.has(table));

  if (missing.length > 0) {
    throw new Error(`Missing expected tables: ${missing.join(", ")}`);
  }

  await verifySeedDatabase();

  runtimeProcess.stdout.write(
    `Verified ${String(expectedTables.length)} domain/auth tables and the server-only seed catalog.\n`,
  );
} finally {
  await client.end();
}
