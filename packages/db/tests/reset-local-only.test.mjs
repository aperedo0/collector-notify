import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// A pure-function test cannot exercise this: the guard's failure mode is the
// process throwing during module evaluation, before `main()`-style code
// could return control to a test. Spawned like the existing
// `auth-schema-generator.test.mjs`, and kept as `.mjs` rather than `.ts` for
// the same reason: `packages/db/tsconfig.json` typechecks `tests/**/*.ts`,
// there is no `@types/node`, and `import { spawnSync } from
// "node:child_process"` fails `pnpm typecheck` in a `.ts` file.
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const resetScriptPath = resolve(repositoryRoot, "packages/db/src/reset.ts");

describe("db:reset local-only guard", () => {
  it("refuses a non-local DATABASE_MIGRATION_URL and exits non-zero", () => {
    const result = spawnSync(process.execPath, [resetScriptPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        // A reserved, unresolvable TLD (RFC 2606): even a regressed guard
        // cannot accidentally reach a real server through this URL, so the
        // test cannot pass by luck.
        DATABASE_MIGRATION_URL: "postgresql://u:p@db.example.invalid:5432/notify",
      },
    });

    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain("local/test-only");
  });
});
