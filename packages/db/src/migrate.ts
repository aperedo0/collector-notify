import {
  describeDatabaseTarget,
  migrationDatabaseUrl,
  runtimeProcess,
} from "./environment.ts";
import { migrateDatabase } from "./operations.ts";

await migrateDatabase();
runtimeProcess.stdout.write(
  `Database migrations are up to date. (${describeDatabaseTarget(migrationDatabaseUrl())})\n`,
);
