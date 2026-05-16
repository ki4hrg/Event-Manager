"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import type { EntityStatus } from "@prisma/client";
import type { StatusCounts } from "@/lib/statusConstants";

function toCounts(items: { status: EntityStatus | null }[]): StatusCounts {
  const counts: StatusCounts = { PENDING: 0, IN_PROGRESS: 0, COMPLETE: 0, CANCELLED: 0, noStatus: 0 };
  for (const item of items) {
    if (item.status === "PENDING") counts.PENDING++;
    else if (item.status === "IN_PROGRESS") counts.IN_PROGRESS++;
    else if (item.status === "COMPLETE") counts.COMPLETE++;
    else if (item.status === "CANCELLED") counts.CANCELLED++;
    else counts.noStatus++;
  }
  return counts;
}

export async function getEventOverviewStats(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  const [
    functionsWithoutSchedule,
    functionsWithoutRoom,
    totalFunctions,
    totalPresentations,
    unassignedPresentations,
    functions,
    avOrders,
    cateringOrders,
    setupOrders,
    presentations,
    printOrders,
    mediaOrders,
  ] = await Promise.all([
    prisma.function.count({ where: { eventId, schedules: { none: {} } } }),
    prisma.function.count({ where: { eventId, rooms: { none: {} }, type: { not: "BREAKOUT_BLOCK" } } }),
    prisma.function.count({ where: { eventId } }),
    prisma.presentation.count({ where: { eventId } }),
    prisma.presentation.count({ where: { eventId, slots: { none: {} } } }),
    prisma.function.findMany({ where: { eventId }, select: { status: true } }),
    prisma.aVOrder.findMany({ where: { eventId }, select: { status: true } }),
    prisma.cateringOrder.findMany({ where: { eventId }, select: { status: true } }),
    prisma.setupOrder.findMany({ where: { eventId }, select: { status: true } }),
    prisma.presentation.findMany({ where: { eventId }, select: { status: true } }),
    prisma.printOrder.findMany({ where: { eventId }, select: { status: true } }),
    prisma.mediaOrder.findMany({ where: { eventId }, select: { status: true } }),
  ]);

  const entityGroups = [
    { label: "Functions", basePath: `/events/${eventId}/functions`, counts: toCounts(functions) },
    { label: "AV Orders", basePath: `/events/${eventId}/av-orders`, counts: toCounts(avOrders) },
    { label: "Catering Orders", basePath: `/events/${eventId}/catering-orders`, counts: toCounts(cateringOrders) },
    { label: "Setup Orders", basePath: `/events/${eventId}/setup-orders`, counts: toCounts(setupOrders) },
    { label: "Presentations", basePath: `/events/${eventId}/presentations`, counts: toCounts(presentations) },
    { label: "Print Orders", basePath: `/events/${eventId}/print-orders`, counts: toCounts(printOrders) },
    { label: "Media Orders", basePath: `/events/${eventId}/media-orders`, counts: toCounts(mediaOrders) },
  ];

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
    entityGroups,
  };
}
