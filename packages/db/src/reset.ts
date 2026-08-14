import postgres from "postgres";

import {
  assertLocalResetUrl,
  migrationDatabaseUrl,
  runtimeProcess,
} from "./environment.ts";
import { seedDatabase } from "./seed-operations.ts";

const databaseUrl = migrationDatabaseUrl();
assertLocalResetUrl(databaseUrl);

const client = postgres(databaseUrl, {
  max: 1,
  onnotice: () => undefined,
});

try {
  await client.begin(async (transaction) => {
    await transaction.unsafe(
      "CREATE SCHEMA notify_reset_pgcrypto AUTHORIZATION notify_migrator",
    );
    await transaction.unsafe(
      "ALTER EXTENSION pgcrypto SET SCHEMA notify_reset_pgcrypto",
    );
    await transaction.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await transaction.unsafe("CREATE SCHEMA public AUTHORIZATION notify_migrator");
    await transaction.unsafe("ALTER EXTENSION pgcrypto SET SCHEMA public");
    await transaction.unsafe("DROP SCHEMA notify_reset_pgcrypto");
  });
} finally {
  await client.end();
}

await seedDatabase();
runtimeProcess.stdout.write("Local Notify database reset, migrated, and seeded.\n");
