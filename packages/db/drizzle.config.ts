import { defineConfig } from "drizzle-kit";

type RuntimeProcess = {
  env: Record<string, string | undefined>;
};

const runtimeProcess = (globalThis as { process?: RuntimeProcess }).process;

// Mirrors migrationDatabaseUrl() in src/environment.ts, which this file does
// not call: unset keeps the local fallback, but present-and-blank (`??` does
// not catch `""`) must throw instead of silently resolving to whatever
// postgres.js falls back to.
function migrationDatabaseUrl(): string {
  const value = runtimeProcess?.env.DATABASE_MIGRATION_URL;
  if (value === undefined) {
    return "postgresql://notify_migrator:notify_local_migrator@127.0.0.1:54329/notify";
  }
  if (value.trim().length === 0) {
    throw new Error(
      "Missing required environment variable: DATABASE_MIGRATION_URL",
    );
  }
  return value;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: migrationDatabaseUrl(),
  },
  migrations: {
    prefix: "index",
    schema: "public",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
