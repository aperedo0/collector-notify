import { describe, expect, it } from "vitest";

import { assertMigrationLedgerIntegrity } from "../src/migration-integrity.ts";

const checkedInMigrations = [
  { folderMillis: 100, hash: "first-hash" },
  { folderMillis: 200, hash: "second-hash" },
] as const;

describe("migration ledger integrity", () => {
  it("accepts an empty database or an exact applied prefix", () => {
    expect(() => assertMigrationLedgerIntegrity(checkedInMigrations, [])).not.toThrow();
    expect(() =>
      assertMigrationLedgerIntegrity(checkedInMigrations, [
        { createdAt: "100", hash: "first-hash" },
      ]),
    ).not.toThrow();
  });

  it("rejects a changed historical migration hash", () => {
    expect(() =>
      assertMigrationLedgerIntegrity(checkedInMigrations, [
        { createdAt: "100", hash: "changed-hash" },
      ]),
    ).toThrow(/immutable ledger/);
  });

  it("rejects missing, reordered, duplicate, or unknown ledger entries", () => {
    expect(() =>
      assertMigrationLedgerIntegrity(checkedInMigrations, [
        { createdAt: "200", hash: "second-hash" },
      ]),
    ).toThrow(/immutable ledger/);

    expect(() =>
      assertMigrationLedgerIntegrity(checkedInMigrations, [
        { createdAt: "100", hash: "first-hash" },
        { createdAt: "100", hash: "first-hash" },
      ]),
    ).toThrow(/immutable ledger/);

    expect(() =>
      assertMigrationLedgerIntegrity(checkedInMigrations, [
        { createdAt: "100", hash: "first-hash" },
        { createdAt: "200", hash: "second-hash" },
        { createdAt: "300", hash: "unknown-hash" },
      ]),
    ).toThrow(/unknown entry/);
  });

  it("rejects invalid database timestamps and unordered checked-in migrations", () => {
    expect(() =>
      assertMigrationLedgerIntegrity(checkedInMigrations, [
        { createdAt: "not-a-timestamp", hash: "first-hash" },
      ]),
    ).toThrow(/invalid timestamp/);

    expect(() =>
      assertMigrationLedgerIntegrity(
        [
          { folderMillis: 200, hash: "first-hash" },
          { folderMillis: 100, hash: "second-hash" },
        ],
        [],
      ),
    ).toThrow(/not strictly ordered/);
  });
});
