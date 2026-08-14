import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const checkedInPath = resolve(repositoryRoot, "packages/db/src/auth-schema.ts");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "notify-auth-schema-"));
const generatedPath = join(temporaryDirectory, "auth-schema.ts");
const checkOnly = process.argv.includes("--check");
let failureMessage;

try {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "auth",
      "generate",
      "--config",
      "apps/api/src/auth.ts",
      "--output",
      generatedPath,
      "--yes",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://schema_generator:unused@127.0.0.1:1/notify_schema",
        BETTER_AUTH_URL: "http://127.0.0.1:8080",
        BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      },
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    if (result.stdout !== undefined) {
      process.stderr.write(result.stdout);
    }
    if (result.stderr !== undefined) {
      process.stderr.write(result.stderr);
    }
    throw new Error(
      result.error?.message ??
        `Better Auth schema generation exited with status ${String(result.status)}.`,
    );
  }

  const generated = readFileSync(generatedPath, "utf8");
  const normalized = [
    "// Generated from apps/api/src/auth.ts with Better Auth 1.6.27.",
    "// Notify's Section 6 timestamptz rule is applied by the generation wrapper.",
    generated.replace(
      /timestamp\(("[^"]+")\)/g,
      "timestamp($1, { withTimezone: true })",
    ),
  ].join("\n");

  if (checkOnly) {
    const checkedIn = readFileSync(checkedInPath, "utf8");
    if (checkedIn !== normalized) {
      process.stderr.write(
        "Better Auth schema is stale. Run `pnpm auth:schema` and review the result.\n",
      );
      throw new Error("Checked-in Better Auth schema does not match generated output.");
    }
    process.stdout.write("Better Auth schema matches the checked-in Drizzle schema.\n");
  } else {
    writeFileSync(checkedInPath, normalized, "utf8");
    process.stdout.write(`Updated ${checkedInPath}\n`);
  }
} catch (error) {
  failureMessage = error instanceof Error ? error.message : String(error);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

if (failureMessage !== undefined) {
  process.stderr.write(`${failureMessage}\n`);
  process.exitCode = 1;
}
