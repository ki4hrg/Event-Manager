import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.setupOrder.findMany({
    where: { name: null },
    include: { room: true },
  });

  console.log(`Backfilling names for ${orders.length} setup orders...`);

  for (const o of orders) {
    const parts = [o.room?.name, o.description].filter(Boolean);
    const name = parts.join(" — ") || "Setup Order";
    await prisma.setupOrder.update({ where: { id: o.id }, data: { name } });
    console.log(`  ${o.id}: "${name}"`);
  }

  console.log("Done.");
}

main().finally(() => prisma.$disconnect());
