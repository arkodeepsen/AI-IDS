// Prisma 7 configuration. Migrations and the runtime client share the same
// SQLite database. The runtime client uses the SQLite adapter (lib/prisma.ts);
// migrations use the datasource URL declared here.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
