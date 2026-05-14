// Backfill new M:N junctions from legacy 1:N / 1:1 FKs on:
//   Function.avOrderId        → AVOrderFunction
//   Function.setupOrderId     → SetupOrderFunction
//   AVOrder.presentationId    → AVOrderPresentation
//   SetupOrder.presentationId → SetupOrderPresentation
//
// Idempotent: uses upsert via the @@unique constraint. Safe to re-run.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [functionsWithAv, functionsWithSetup, avOrdersWithPres, setupOrdersWithPres] = await Promise.all([
    prisma.function.findMany({ where: { avOrderId: { not: null } }, select: { id: true, avOrderId: true } }),
    prisma.function.findMany({ where: { setupOrderId: { not: null } }, select: { id: true, setupOrderId: true } }),
    prisma.aVOrder.findMany({ where: { presentationId: { not: null } }, select: { id: true, presentationId: true } }),
    prisma.setupOrder.findMany({ where: { presentationId: { not: null } }, select: { id: true, presentationId: true } }),
  ]);

  console.log(`Function → AVOrder pairs:        ${functionsWithAv.length}`);
  console.log(`Function → SetupOrder pairs:     ${functionsWithSetup.length}`);
  console.log(`AVOrder → Presentation pairs:    ${avOrdersWithPres.length}`);
  console.log(`SetupOrder → Presentation pairs: ${setupOrdersWithPres.length}`);

  let avFnInserted = 0;
  for (const fn of functionsWithAv) {
    if (!fn.avOrderId) continue;
    const res = await prisma.aVOrderFunction.upsert({
      where: { avOrderId_functionId: { avOrderId: fn.avOrderId, functionId: fn.id } },
      create: { avOrderId: fn.avOrderId, functionId: fn.id },
      update: {},
    });
    if (res) avFnInserted++;
  }
  console.log(`  AVOrderFunction rows ensured: ${avFnInserted}`);

  let setupFnInserted = 0;
  for (const fn of functionsWithSetup) {
    if (!fn.setupOrderId) continue;
    const res = await prisma.setupOrderFunction.upsert({
      where: { setupOrderId_functionId: { setupOrderId: fn.setupOrderId, functionId: fn.id } },
      create: { setupOrderId: fn.setupOrderId, functionId: fn.id },
      update: {},
    });
    if (res) setupFnInserted++;
  }
  console.log(`  SetupOrderFunction rows ensured: ${setupFnInserted}`);

  let avPresInserted = 0;
  for (const av of avOrdersWithPres) {
    if (!av.presentationId) continue;
    const res = await prisma.aVOrderPresentation.upsert({
      where: { avOrderId_presentationId: { avOrderId: av.id, presentationId: av.presentationId } },
      create: { avOrderId: av.id, presentationId: av.presentationId },
      update: {},
    });
    if (res) avPresInserted++;
  }
  console.log(`  AVOrderPresentation rows ensured: ${avPresInserted}`);

  let setupPresInserted = 0;
  for (const so of setupOrdersWithPres) {
    if (!so.presentationId) continue;
    const res = await prisma.setupOrderPresentation.upsert({
      where: { setupOrderId_presentationId: { setupOrderId: so.id, presentationId: so.presentationId } },
      create: { setupOrderId: so.id, presentationId: so.presentationId },
      update: {},
    });
    if (res) setupPresInserted++;
  }
  console.log(`  SetupOrderPresentation rows ensured: ${setupPresInserted}`);

  console.log("Done.");
}

main().finally(() => prisma.$disconnect());
