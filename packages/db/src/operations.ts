import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres, { type Sql } from "postgres";

import { migrationDatabaseUrl, runtimeProcess } from "./environment.ts";
import {
  type AppliedMigrationRecord,
  assertMigrationLedgerIntegrity,
} from "./migration-integrity.ts";

const migrationsSchema = "public";
const migrationsTable = "__drizzle_migrations";

async function readAppliedMigrations(client: Sql): Promise<AppliedMigrationRecord[]> {
  const tableRows = await client<{ exists: boolean }[]>`
    SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL AS exists
  `;
  if (tableRows[0]?.exists !== true) {
    return [];
  }

  const rows = await client<{ createdAt: string; hash: string }[]>`
    SELECT hash, created_at::text AS "createdAt"
      FROM public.__drizzle_migrations
     ORDER BY id
  `;
  return rows;
}

export async function migrateDatabase(): Promise<void> {
  const migrationsFolder = `${runtimeProcess.cwd()}/migrations`;
  const migrationConfig = {
    migrationsFolder,
    migrationsSchema,
    migrationsTable,
  } as const;
  const checkedInMigrations = readMigrationFiles(migrationConfig);
  const client = postgres(migrationDatabaseUrl(), {
    max: 1,
    onnotice: () => undefined,
  });
  const database = drizzle(client);

  try {
    assertMigrationLedgerIntegrity(
      checkedInMigrations,
      await readAppliedMigrations(client),
    );
    await migrate(database, migrationConfig);

    const appliedMigrations = await readAppliedMigrations(client);
    assertMigrationLedgerIntegrity(checkedInMigrations, appliedMigrations);
    if (appliedMigrations.length !== checkedInMigrations.length) {
      throw new Error("Database migration ledger is incomplete after migration.");
    }
  } finally {
    await client.end();
  }
}
