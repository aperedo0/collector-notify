import type { MigrationMeta } from "drizzle-orm/migrator";

export type AppliedMigrationRecord = {
  createdAt: bigint | number | string;
  hash: string;
};

type CheckedInMigration = Pick<MigrationMeta, "folderMillis" | "hash">;

function migrationTimestamp(value: bigint | number | string, position: number): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(
      `Database migration ledger has an invalid timestamp at position ${String(position)}.`,
    );
  }
}

export function assertMigrationLedgerIntegrity(
  checkedInMigrations: readonly CheckedInMigration[],
  appliedMigrations: readonly AppliedMigrationRecord[],
): void {
  for (const [index, migration] of checkedInMigrations.entries()) {
    const previousMigration = checkedInMigrations[index - 1];
    if (
      !Number.isSafeInteger(migration.folderMillis) ||
      (previousMigration !== undefined &&
        migration.folderMillis <= previousMigration.folderMillis)
    ) {
      throw new Error(
        `Checked-in migration ledger is not strictly ordered at position ${String(index + 1)}.`,
      );
    }
  }

  for (const [index, appliedMigration] of appliedMigrations.entries()) {
    const position = index + 1;
    const checkedInMigration = checkedInMigrations[index];
    if (checkedInMigration === undefined) {
      throw new Error(
        `Database migration ledger has an unknown entry at position ${String(position)}.`,
      );
    }

    const appliedTimestamp = migrationTimestamp(appliedMigration.createdAt, position);
    const checkedInTimestamp = BigInt(checkedInMigration.folderMillis);
    if (
      appliedTimestamp !== checkedInTimestamp ||
      appliedMigration.hash !== checkedInMigration.hash
    ) {
      throw new Error(
        `Applied migration at position ${String(position)} does not match the checked-in immutable ledger.`,
      );
    }
  }
}
