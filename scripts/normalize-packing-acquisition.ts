import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const supply = await prisma.supplyOrderItem.updateMany({
    where: {
      packingStatus: { in: ["IN_TRANSIT", "DELIVERED"] },
      acquisitionState: "TO_PROCURE",
    },
    data: { acquisitionState: "ON_HAND" },
  });

  const print = await prisma.printItem.updateMany({
    where: {
      packingStatus: { in: ["IN_TRANSIT", "DELIVERED"] },
      acquisitionState: "TO_PROCURE",
    },
    data: { acquisitionState: "ON_HAND" },
  });

  console.log(`Normalized: ${supply.count} supply items, ${print.count} print items.`);
}

main().finally(() => prisma.$disconnect());
