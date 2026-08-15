import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const temporaryDirectoryPrefix = "notify-auth-schema-";
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const generatorPath = resolve(
  repositoryRoot,
  "packages/db/scripts/generate-auth-schema.mjs",
);

function generatorTemporaryDirectories() {
  return readdirSync(tmpdir())
    .filter((entry) => entry.startsWith(temporaryDirectoryPrefix))
    .sort();
}

describe("Better Auth schema generator", () => {
  it("reports startup failures and removes its temporary directory", () => {
    const before = generatorTemporaryDirectories();

    const result = spawnSync(process.execPath, [generatorPath, "--check"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "/notify-intentionally-missing",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("spawnSync pnpm ENOENT");
    expect(generatorTemporaryDirectories()).toEqual(before);
  });

  it("confirms the checked-in schema matches apps/api/src/auth.ts", () => {
    const result = spawnSync(process.execPath, [generatorPath, "--check"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
  });
});
