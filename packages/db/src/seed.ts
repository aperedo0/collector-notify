import { runtimeProcess } from "./environment.ts";
import { seedDatabase } from "./seed-operations.ts";

await seedDatabase();
runtimeProcess.stdout.write("Database seed is up to date.\n");
