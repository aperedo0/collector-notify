import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "@notify/db/schema";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type RuntimeProcess = {
  env: Record<string, string | undefined>;
};

const runtimeProcess = (globalThis as { process?: RuntimeProcess }).process;

function requiredEnvironmentVariable(name: string): string {
  const value = runtimeProcess?.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const databaseUrl = requiredEnvironmentVariable("DATABASE_URL");
const baseURL = requiredEnvironmentVariable("BETTER_AUTH_URL");
const secret = requiredEnvironmentVariable("BETTER_AUTH_SECRET");
if (secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
}

const client = postgres(databaseUrl, { max: 10 });
const db = drizzle(client, { schema });

export const auth = betterAuth({
  appName: "Notify",
  baseURL,
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
