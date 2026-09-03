import { PrismaClient } from "@prisma/client";

// One-off repair for FunctionSchedule rows written with the legacy hard-coded
// "SESSION" / "MAIN" types, which match no "schedule_type" option. Rewrites them
// to the same default the app now resolves at write time.
const prisma = new PrismaClient();
const PREFERRED = "Main Event";

async function main() {
  const options = await prisma.customOption.findMany({
    where: { category: "schedule_type" },
    orderBy: { sortOrder: "asc" },
    select: { label: true },
  });
  const target = options.find((o) => o.label === PREFERRED)?.label ?? options[0]?.label;
  if (!target) {
    console.error("No schedule_type options exist; run db:seed first.");
    process.exit(1);
  }

  const result = await prisma.functionSchedule.updateMany({
    where: { type: { in: ["SESSION", "MAIN"] } },
    data: { type: target },
  });
  console.log(`Rewrote ${result.count} schedule row(s) to "${target}".`);
}

main().finally(() => prisma.$disconnect());
