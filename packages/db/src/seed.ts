import {
  describeDatabaseTarget,
  migrationDatabaseUrl,
  runtimeProcess,
} from "./environment.ts";
import { verifySeedDatabase } from "./seed-operations.ts";

await verifySeedDatabase();
runtimeProcess.stdout.write(
  `Database seed is up to date. (${describeDatabaseTarget(migrationDatabaseUrl())})\n`,
);
