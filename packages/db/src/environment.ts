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

export function assertLocalResetUrl(databaseUrl: string): void {
  const localDatabasePattern =
    /^postgres(?:ql)?:\/\/[^/@]+(?::[^/@]*)?@(?:127\.0\.0\.1|localhost)(?::\d+)?\/notify(?:\?.*)?$/;

  if (!localDatabasePattern.test(databaseUrl)) {
    throw new Error(
      "db:reset is local/test-only and requires the local Notify PostgreSQL database.",
    );
  }
}
