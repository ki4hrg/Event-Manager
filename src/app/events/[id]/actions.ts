"use server";

import { prisma } from "@/lib/prisma";

export async function getEventOverviewStats(eventId: string) {
  const [
    functionsWithoutSchedule,
    functionsWithoutRoom,
    unassignedPresentations,
    functionIds,
    presentationIds,
    cateringOrderIds,
    avOrderIds,
  ] = await Promise.all([
    prisma.function.count({ where: { eventId, schedules: { none: {} } } }),
    prisma.function.count({ where: { eventId, rooms: { none: {} } } }),
    prisma.presentation.count({ where: { eventId, slots: { none: {} } } }),
    prisma.function
      .findMany({ where: { eventId }, select: { id: true } })
      .then((r) => r.map((x) => x.id)),
    prisma.presentation
      .findMany({ where: { eventId }, select: { id: true } })
      .then((r) => r.map((x) => x.id)),
    prisma.cateringOrder
      .findMany({ where: { eventId }, select: { id: true } })
      .then((r) => r.map((x) => x.id)),
    prisma.aVOrder
      .findMany({ where: { eventId }, select: { id: true } })
      .then((r) => r.map((x) => x.id)),
  ]);

  const workflowStats = { notStarted: 0, inProgress: 0, done: 0 };

  const hasEntities =
    functionIds.length > 0 ||
    presentationIds.length > 0 ||
    cateringOrderIds.length > 0 ||
    avOrderIds.length > 0;

  if (hasEntities) {
    const instances = await prisma.workflowInstance.findMany({
      where: {
        OR: [
          { entityType: "function", entityId: { in: functionIds } },
          { entityType: "presentation", entityId: { in: presentationIds } },
          { entityType: "catering_order", entityId: { in: cateringOrderIds } },
          { entityType: "av_order", entityId: { in: avOrderIds } },
        ],
      },
      include: {
        template: { select: { _count: { select: { steps: true } } } },
        stepCompletions: { select: { id: true } },
      },
    });

    for (const inst of instances) {
      const total = inst.template._count.steps;
      const completed = inst.stepCompletions.length;
      if (completed === 0) workflowStats.notStarted++;
      else if (completed >= total) workflowStats.done++;
      else workflowStats.inProgress++;
    }
  }

  return {
    functions: {
      total: functionIds.length,
      missingSchedule: functionsWithoutSchedule,
      missingRoom: functionsWithoutRoom,
    },
    presentations: {
      total: presentationIds.length,
      unassigned: unassignedPresentations,
    },
    workflow: workflowStats,
  };
}
