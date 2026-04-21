"use server";

import { prisma } from "@/lib/prisma";

export async function getEventOverviewStats(eventId: string) {
  const [
    functionsWithoutSchedule,
    functionsWithoutRoom,
    totalFunctions,
    totalPresentations,
    unassignedPresentations,
    functionStatusGroups,
    avOrderStatusGroups,
    cateringOrderStatusGroups,
    setupOrderStatusGroups,
  ] = await Promise.all([
    prisma.function.count({ where: { eventId, schedules: { none: {} } } }),
    prisma.function.count({ where: { eventId, rooms: { none: {} } } }),
    prisma.function.count({ where: { eventId } }),
    prisma.presentation.count({ where: { eventId } }),
    prisma.presentation.count({ where: { eventId, slots: { none: {} } } }),
    prisma.function.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.aVOrder.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.cateringOrder.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.setupOrder.groupBy({ by: ["status"], where: { eventId }, _count: true }),
  ]);

  const entityStatus = { pending: 0, inProgress: 0, complete: 0, cancelled: 0 };
  for (const g of [...functionStatusGroups, ...avOrderStatusGroups, ...cateringOrderStatusGroups, ...setupOrderStatusGroups]) {
    if (g.status === "PENDING") entityStatus.pending += g._count;
    else if (g.status === "IN_PROGRESS") entityStatus.inProgress += g._count;
    else if (g.status === "COMPLETE") entityStatus.complete += g._count;
    else if (g.status === "CANCELLED") entityStatus.cancelled += g._count;
  }

  return {
    functions: {
      total: totalFunctions,
      missingSchedule: functionsWithoutSchedule,
      missingRoom: functionsWithoutRoom,
    },
    presentations: {
      total: totalPresentations,
      unassigned: unassignedPresentations,
    },
    entityStatus,
  };
}
