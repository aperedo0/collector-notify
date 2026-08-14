import { defineConfig } from "drizzle-kit";

type RuntimeProcess = {
  env: Record<string, string | undefined>;
};

const runtimeProcess = (globalThis as { process?: RuntimeProcess }).process;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      runtimeProcess?.env.DATABASE_MIGRATION_URL ??
      "postgresql://notify_migrator:notify_local_migrator@127.0.0.1:54329/notify",
  },
  migrations: {
    prefix: "index",
    schema: "public",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
