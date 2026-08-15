type RuntimeProcess = {
  cwd: () => string;
  env: Record<string, string | undefined>;
  stdout: { write: (message: string) => void };
};

const candidateProcess = (globalThis as { process?: RuntimeProcess }).process;

export const runtimeProcess: RuntimeProcess = (() => {
  if (candidateProcess === undefined) {
    throw new Error("@notify/db requires a Node.js runtime.");
  }
  return candidateProcess;
})();

export const LOCAL_MIGRATION_URL =
  "postgresql://notify_migrator:notify_local_migrator@127.0.0.1:54329/notify";

export function migrationDatabaseUrl(): string {
  return runtimeProcess.env.DATABASE_MIGRATION_URL ?? LOCAL_MIGRATION_URL;
}

// Strips userinfo (username and password) from a Postgres connection URL so
// entry points can print which host/database they acted on without leaking
// credentials. Uses `slice`, not `new URL()`: TypeScript has no type
// declaration for the global `URL` under this package's `lib: ["ES2024"]`
// with no `@types/node`, so `new URL()` fails to compile (it would work fine
// at runtime). `lastIndexOf` still works when the password contains "@",
// and degrades to the full URL when there is no userinfo to strip.
export function describeDatabaseTarget(url: string): string {
  return url.slice(url.lastIndexOf("@") + 1);
}

export function assertLocalResetUrl(databaseUrl: string): void {
  const localDatabasePattern =
    /^postgres(?:ql)?:\/\/[^/@]+(?::[^/@]*)?@(?:127\.0\.0\.1|localhost)(?::\d+)?\/notify(?:\?.*)?$/;

  if (!localDatabasePattern.test(databaseUrl)) {
    throw new Error(
      "db:reset is local/test-only and requires the local Notify PostgreSQL database.",
    );
  }
}
