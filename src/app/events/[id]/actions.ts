"use server";

import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import type { EntityStatus } from "@prisma/client";
import type { StatusCounts } from "@/lib/statusConstants";

export type EntityAttention = { label: string; count: number; href: string };

export type EntityEntry = {
  key: string;
  label: string;
  basePath: string;
  total: number;
  counts: StatusCounts;
  attention: EntityAttention[];
  canEdit: boolean;
};

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
    canViewFunctions,
    canEditFunctions,
    canViewPresentations,
    canEditPresentations,
    canViewAVOrders,
    canEditAVOrders,
    canViewCateringOrders,
    canEditCateringOrders,
    canViewSetupOrders,
    canEditSetupOrders,
    canViewPrintOrders,
    canEditPrintOrders,
    canViewMediaOrders,
    canEditMediaOrders,
  ] = await Promise.all([
    hasPermission("FUNCTIONS", "VIEW", eventId),
    hasPermission("FUNCTIONS", "WRITE", eventId),
    hasPermission("PRESENTATIONS", "VIEW", eventId),
    hasPermission("PRESENTATIONS", "WRITE", eventId),
    hasPermission("AV_ORDERS", "VIEW", eventId),
    hasPermission("AV_ORDERS", "WRITE", eventId),
    hasPermission("CATERING_ORDERS", "VIEW", eventId),
    hasPermission("CATERING_ORDERS", "WRITE", eventId),
    hasPermission("SETUP_ORDERS", "VIEW", eventId),
    hasPermission("SETUP_ORDERS", "WRITE", eventId),
    hasPermission("PRINT_ORDERS", "VIEW", eventId),
    hasPermission("PRINT_ORDERS", "WRITE", eventId),
    hasPermission("MEDIA_ORDERS", "VIEW", eventId),
    hasPermission("MEDIA_ORDERS", "WRITE", eventId),
  ]);

  const [
    functions,
    functionsMissingSchedule,
    functionsMissingRoom,
    presentations,
    presentationsMissingSlot,
    presentationsMissingSpeaker,
    avOrders,
    avMissingVendor,
    avMissingFunction,
    cateringOrders,
    cateringMissingVendor,
    cateringMissingFunction,
    setupOrders,
    setupMissingVendor,
    setupMissingFunction,
    printOrders,
    printMissingVendor,
    printMissingFunction,
    mediaOrders,
    mediaMissingVendor,
    mediaMissingFunction,
  ] = await Promise.all([
    canViewFunctions
      ? prisma.function.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewFunctions && canEditFunctions
      ? prisma.function.count({ where: { eventId, schedules: { none: {} } } })
      : Promise.resolve(0),
    canViewFunctions && canEditFunctions
      ? prisma.function.count({ where: { eventId, rooms: { none: {} }, type: { not: "BREAKOUT_BLOCK" } } })
      : Promise.resolve(0),
    canViewPresentations
      ? prisma.presentation.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewPresentations && canEditPresentations
      ? prisma.presentation.count({ where: { eventId, slots: { none: {} } } })
      : Promise.resolve(0),
    canViewPresentations && canEditPresentations
      ? prisma.presentation.count({ where: { eventId, speakers: { none: {} } } })
      : Promise.resolve(0),
    canViewAVOrders
      ? prisma.aVOrder.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewAVOrders && canEditAVOrders
      ? prisma.aVOrder.count({ where: { eventId, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewAVOrders && canEditAVOrders
      ? prisma.aVOrder.count({ where: { eventId, functionLinks: { none: {} } } })
      : Promise.resolve(0),
    canViewCateringOrders
      ? prisma.cateringOrder.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewCateringOrders && canEditCateringOrders
      ? prisma.cateringOrder.count({ where: { eventId, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewCateringOrders && canEditCateringOrders
      ? prisma.cateringOrder.count({ where: { eventId, functionId: null } })
      : Promise.resolve(0),
    canViewSetupOrders
      ? prisma.setupOrder.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewSetupOrders && canEditSetupOrders
      ? prisma.setupOrder.count({ where: { eventId, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewSetupOrders && canEditSetupOrders
      ? prisma.setupOrder.count({ where: { eventId, functionLinks: { none: {} } } })
      : Promise.resolve(0),
    canViewPrintOrders
      ? prisma.printOrder.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewPrintOrders && canEditPrintOrders
      ? prisma.printOrder.count({ where: { eventId, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewPrintOrders && canEditPrintOrders
      ? prisma.printOrder.count({ where: { eventId, functions: { none: {} } } })
      : Promise.resolve(0),
    canViewMediaOrders
      ? prisma.mediaOrder.findMany({ where: { eventId }, select: { status: true } })
      : Promise.resolve(null),
    canViewMediaOrders && canEditMediaOrders
      ? prisma.mediaOrder.count({ where: { eventId, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewMediaOrders && canEditMediaOrders
      ? prisma.mediaOrder.count({ where: { eventId, functionLinks: { none: {} } } })
      : Promise.resolve(0),
  ]);

  const entities: EntityEntry[] = [];

  if (canViewFunctions && functions) {
    const basePath = `/events/${eventId}/functions`;
    entities.push({
      key: "functions",
      label: "Functions",
      basePath,
      total: functions.length,
      counts: toCounts(functions),
      canEdit: canEditFunctions,
      attention: canEditFunctions
        ? [
            { label: "missing schedule", count: functionsMissingSchedule, href: `${basePath}?schedule=none` },
            { label: "missing room", count: functionsMissingRoom, href: `${basePath}?room=none` },
          ]
        : [],
    });
  }

  if (canViewPresentations && presentations) {
    const basePath = `/events/${eventId}/presentations`;
    entities.push({
      key: "presentations",
      label: "Presentations",
      basePath,
      total: presentations.length,
      counts: toCounts(presentations),
      canEdit: canEditPresentations,
      attention: canEditPresentations
        ? [
            { label: "unassigned", count: presentationsMissingSlot, href: `${basePath}?slot=none` },
            { label: "missing speaker", count: presentationsMissingSpeaker, href: `${basePath}?speaker=none` },
          ]
        : [],
    });
  }

  if (canViewAVOrders && avOrders) {
    const basePath = `/events/${eventId}/av-orders`;
    entities.push({
      key: "av-orders",
      label: "AV Orders",
      basePath,
      total: avOrders.length,
      counts: toCounts(avOrders),
      canEdit: canEditAVOrders,
      attention: canEditAVOrders
        ? [
            { label: "missing vendor", count: avMissingVendor, href: `${basePath}?vendor=none` },
            { label: "missing function", count: avMissingFunction, href: `${basePath}?function=none` },
          ]
        : [],
    });
  }

  if (canViewCateringOrders && cateringOrders) {
    const basePath = `/events/${eventId}/catering-orders`;
    entities.push({
      key: "catering-orders",
      label: "Catering Orders",
      basePath,
      total: cateringOrders.length,
      counts: toCounts(cateringOrders),
      canEdit: canEditCateringOrders,
      attention: canEditCateringOrders
        ? [
            { label: "missing vendor", count: cateringMissingVendor, href: `${basePath}?vendor=none` },
            { label: "missing function", count: cateringMissingFunction, href: `${basePath}?function=none` },
          ]
        : [],
    });
  }

  if (canViewSetupOrders && setupOrders) {
    const basePath = `/events/${eventId}/setup-orders`;
    entities.push({
      key: "setup-orders",
      label: "Setup Orders",
      basePath,
      total: setupOrders.length,
      counts: toCounts(setupOrders),
      canEdit: canEditSetupOrders,
      attention: canEditSetupOrders
        ? [
            { label: "missing vendor", count: setupMissingVendor, href: `${basePath}?vendor=none` },
            { label: "missing function", count: setupMissingFunction, href: `${basePath}?function=none` },
          ]
        : [],
    });
  }

  if (canViewPrintOrders && printOrders) {
    const basePath = `/events/${eventId}/print-orders`;
    entities.push({
      key: "print-orders",
      label: "Print Orders",
      basePath,
      total: printOrders.length,
      counts: toCounts(printOrders),
      canEdit: canEditPrintOrders,
      attention: canEditPrintOrders
        ? [
            { label: "missing vendor", count: printMissingVendor, href: `${basePath}?vendor=none` },
            { label: "missing function", count: printMissingFunction, href: `${basePath}?function=none` },
          ]
        : [],
    });
  }

  if (canViewMediaOrders && mediaOrders) {
    const basePath = `/events/${eventId}/media-orders`;
    entities.push({
      key: "media-orders",
      label: "Media Orders",
      basePath,
      total: mediaOrders.length,
      counts: toCounts(mediaOrders),
      canEdit: canEditMediaOrders,
      attention: canEditMediaOrders
        ? [
            { label: "missing vendor", count: mediaMissingVendor, href: `${basePath}?vendor=none` },
            { label: "missing function", count: mediaMissingFunction, href: `${basePath}?function=none` },
          ]
        : [],
    });
  }

  return { entities };
}
