// Marks the 0_init migration as applied on databases that predate Prisma
// Migrate in this project (they were built with `prisma db push`). Without this,
// `prisma migrate deploy` would try to re-create every table on first run.
//
// Fresh databases (no tables yet) are left alone so migrate deploy builds them
// from scratch. Run before `prisma migrate deploy`; see the Dockerfile CMD.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name) {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ${name}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function main() {
  const [hasMigrations, hasUsers] = await Promise.all([
    tableExists("_prisma_migrations"),
    tableExists("User"),
  ]);
  if (hasMigrations || !hasUsers) return;
  console.log("Existing db-push database detected; baselining 0_init as applied.");
  execSync("npx prisma migrate resolve --applied 0_init", { stdio: "inherit" });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
