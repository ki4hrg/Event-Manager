"use server";

import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { EntityStatus } from "@prisma/client";
import type { StatusCounts } from "@/lib/statusConstants";
import type { WorkflowStepCount } from "@/lib/workflowProgress";
import { defaultWorkflowStepCounts } from "@/app/events/workflows/core";
import type { WorkflowEntityType } from "@/app/events/workflows/entity-types";

export type EntityAttention = { label: string; count: number; href: string };

// Records at each step of a default workflow template, each count linking to
// the list filtered to that step.
export type EntityWorkflowCounts = { templateId: string; name: string; steps: (WorkflowStepCount & { href: string })[] };

export type EntityEntry = {
  key: string;
  label: string;
  basePath: string;
  total: number;
  counts: StatusCounts;
  attention: EntityAttention[];
  workflows: EntityWorkflowCounts[];
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

const notCancelled = { not: EntityStatus.CANCELLED };

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
    canViewSupplyOrders,
    canEditSupplyOrders,
    canViewMediaDeliverables,
    canEditMediaDeliverables,
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
    hasPermission("SUPPLY_ORDERS", "VIEW", eventId),
    hasPermission("SUPPLY_ORDERS", "WRITE", eventId),
    hasPermission("MEDIA_DELIVERABLES", "VIEW", eventId),
    hasPermission("MEDIA_DELIVERABLES", "WRITE", eventId),
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
    avUnlinked,
    cateringOrders,
    cateringMissingVendor,
    cateringMissingFunction,
    setupOrders,
    setupMissingVendor,
    setupUnlinked,
    printOrders,
    printMissingVendor,
    printUnlinked,
    supplyOrders,
    supplyMissingProvider,
    supplyUnlinked,
    mediaDeliverables,
    mediaMissingProvider,
    mediaUnlinked,
  ] = await Promise.all([
    canViewFunctions
      ? prisma.function.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewFunctions && canEditFunctions
      ? prisma.function.count({ where: { eventId, status: notCancelled, schedules: { none: {} } } })
      : Promise.resolve(0),
    canViewFunctions && canEditFunctions
      ? prisma.function.count({ where: { eventId, status: notCancelled, rooms: { none: {} }, offSiteLocation: null, type: { not: "BREAKOUT_BLOCK" } } })
      : Promise.resolve(0),
    canViewPresentations
      ? prisma.presentation.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewPresentations && canEditPresentations
      ? prisma.presentation.count({ where: { eventId, status: notCancelled, slots: { none: {} } } })
      : Promise.resolve(0),
    canViewPresentations && canEditPresentations
      ? prisma.presentation.count({ where: { eventId, status: notCancelled, speakers: { none: {} } } })
      : Promise.resolve(0),
    canViewAVOrders
      ? prisma.aVOrder.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewAVOrders && canEditAVOrders
      ? prisma.aVOrder.count({ where: { eventId, status: notCancelled, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewAVOrders && canEditAVOrders
      ? prisma.aVOrder.count({ where: { eventId, status: notCancelled, functionLinks: { none: {} }, presentationLinks: { none: {} } } })
      : Promise.resolve(0),
    canViewCateringOrders
      ? prisma.cateringOrder.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewCateringOrders && canEditCateringOrders
      ? prisma.cateringOrder.count({ where: { eventId, status: notCancelled, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewCateringOrders && canEditCateringOrders
      ? prisma.cateringOrder.count({ where: { eventId, status: notCancelled, functionId: null } })
      : Promise.resolve(0),
    canViewSetupOrders
      ? prisma.setupOrder.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewSetupOrders && canEditSetupOrders
      ? prisma.setupOrder.count({ where: { eventId, status: notCancelled, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewSetupOrders && canEditSetupOrders
      ? prisma.setupOrder.count({ where: { eventId, status: notCancelled, functionLinks: { none: {} }, presentationLinks: { none: {} } } })
      : Promise.resolve(0),
    canViewPrintOrders
      ? prisma.printOrder.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewPrintOrders && canEditPrintOrders
      ? prisma.printOrder.count({ where: { eventId, status: notCancelled, vendors: { none: {} } } })
      : Promise.resolve(0),
    canViewPrintOrders && canEditPrintOrders
      ? prisma.printOrder.count({ where: { eventId, status: notCancelled, functions: { none: {} }, presentationId: null, roomId: null } })
      : Promise.resolve(0),
    canViewSupplyOrders
      ? prisma.supplyOrder.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewSupplyOrders && canEditSupplyOrders
      ? prisma.supplyOrder.count({
          where: { eventId, status: notCancelled, providerVendorId: null, providerContactId: null },
        })
      : Promise.resolve(0),
    canViewSupplyOrders && canEditSupplyOrders
      ? prisma.supplyOrder.count({ where: { eventId, status: notCancelled, functions: { none: {} }, presentations: { none: {} }, roomId: null } })
      : Promise.resolve(0),
    canViewMediaDeliverables
      ? prisma.mediaDeliverable.findMany({ where: { eventId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    canViewMediaDeliverables && canEditMediaDeliverables
      ? prisma.mediaDeliverable.count({
          where: { eventId, status: notCancelled, providerVendorId: null, providerContactId: null },
        })
      : Promise.resolve(0),
    canViewMediaDeliverables && canEditMediaDeliverables
      ? prisma.mediaDeliverable.count({ where: { eventId, status: notCancelled, functionLinks: { none: {} }, presentationLinks: { none: {} } } })
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
      workflows: [],
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
      workflows: [],
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
      workflows: [],
      canEdit: canEditAVOrders,
      attention: canEditAVOrders
        ? [
            { label: "missing vendor", count: avMissingVendor, href: `${basePath}?vendor=none` },
            { label: "unlinked", count: avUnlinked, href: `${basePath}?linked=none` },
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
      workflows: [],
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
      workflows: [],
      canEdit: canEditSetupOrders,
      attention: canEditSetupOrders
        ? [
            { label: "missing vendor", count: setupMissingVendor, href: `${basePath}?vendor=none` },
            { label: "unlinked", count: setupUnlinked, href: `${basePath}?linked=none` },
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
      workflows: [],
      canEdit: canEditPrintOrders,
      attention: canEditPrintOrders
        ? [
            { label: "missing vendor", count: printMissingVendor, href: `${basePath}?vendor=none` },
            { label: "unlinked", count: printUnlinked, href: `${basePath}?linked=none` },
          ]
        : [],
    });
  }

  if (canViewSupplyOrders && supplyOrders) {
    const basePath = `/events/${eventId}/supply-orders`;
    entities.push({
      key: "supply-orders",
      label: "Supply Orders",
      basePath,
      total: supplyOrders.length,
      counts: toCounts(supplyOrders),
      workflows: [],
      canEdit: canEditSupplyOrders,
      attention: canEditSupplyOrders
        ? [
            { label: "missing provider", count: supplyMissingProvider, href: basePath },
            { label: "unlinked", count: supplyUnlinked, href: `${basePath}?linked=none` },
          ]
        : [],
    });
  }

  if (canViewMediaDeliverables && mediaDeliverables) {
    const basePath = `/events/${eventId}/media-deliverables`;
    entities.push({
      key: "media-deliverables",
      label: "Media Deliverables",
      basePath,
      total: mediaDeliverables.length,
      counts: toCounts(mediaDeliverables),
      workflows: [],
      canEdit: canEditMediaDeliverables,
      attention: canEditMediaDeliverables
        ? [
            { label: "missing provider", count: mediaMissingProvider, href: `${basePath}?vendor=none` },
            { label: "unlinked", count: mediaUnlinked, href: `${basePath}?linked=none` },
          ]
        : [],
    });
  }

  // Non-cancelled records only, like the attention counts.
  const live = (rows: { id: string; status: EntityStatus | null }[] | null) =>
    (rows ?? []).filter((r) => r.status !== EntityStatus.CANCELLED).map((r) => r.id);
  const workflowTypes: Record<string, [WorkflowEntityType, { id: string; status: EntityStatus | null }[] | null]> = {
    functions: ["function", functions],
    presentations: ["presentation", presentations],
    "av-orders": ["av_order", avOrders],
    "catering-orders": ["catering_order", cateringOrders],
    "setup-orders": ["setup_order", setupOrders],
    "print-orders": ["print_order", printOrders],
    "supply-orders": ["supply_order", supplyOrders],
    "media-deliverables": ["media_deliverable", mediaDeliverables],
  };
  await Promise.all(
    entities.map(async (e) => {
      const [type, rows] = workflowTypes[e.key];
      const counts = await defaultWorkflowStepCounts(type, live(rows), eventId);
      e.workflows = counts.map((t) => ({
        templateId: t.templateId,
        name: t.name,
        steps: t.steps.map((s) => ({ ...s, href: `${e.basePath}?step=${encodeURIComponent(s.key)}` })),
      }));
    }),
  );

  return { entities };
}
