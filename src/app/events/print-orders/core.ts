// Pure cores for print-order + print-item + link mutations.
// NOT a "use server" file — see src/app/contacts/core.ts for the security rationale.

import type { AcquisitionState, EntityStatus, PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError } from "@/lib/permissions";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { assertEventRefs } from "@/lib/eventRefs";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";

async function assertPrintOrderInEvent(printOrderId: string, eventId: string) {
  const found = await prisma.printOrder.findUnique({
    where: { id: printOrderId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

async function bumpPrintOrder(printOrderId: string, eventId: string, userId: string) {
  await prisma.printOrder.updateMany({ where: { id: printOrderId, eventId }, data: { updatedById: userId } });
}

// ---------------------------------------------------------------------------
// PrintOrder

export type CreatePrintOrderArgs = {
  name: string;
  notes: string | null;
  roomId: string | null;
  specificLocation: string | null;
  // Optional initial function/presentation links and vendor assignment.
  // When vendorId is null we look up the event's default PRINT_ORDER vendor.
  functionId: string | null;
  presentationId: string | null;
  vendorId: string | null;
};

export async function createPrintOrderCore(
  eventId: string,
  args: CreatePrintOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: [args.roomId], functionIds: [args.functionId], presentationIds: [args.presentationId], vendorIds: [args.vendorId] });
  const defaults = await resolveCreateStatus(eventId, "PRINT_ORDER");

  const printOrder = await prisma.printOrder.create({
    data: {
      name: args.name,
      eventId,
      notes: args.notes,
      roomId: args.roomId,
      specificLocation: args.specificLocation,
      presentationId: args.presentationId,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
    },
  });

  // Fall back to the event's default PRINT_ORDER vendor if the caller didn't
  // pin one. Inline prisma lookup avoids bouncing through the session-based
  // getDefaultVendorForModel server action.
  const [, defaultVendor] = await Promise.all([
    args.functionId
      ? prisma.printOrderFunction.create({
          data: { printOrderId: printOrder.id, functionId: args.functionId },
        })
      : Promise.resolve(null),
    !args.vendorId
      ? prisma.eventVendor.findFirst({
          where: { eventId, defaultFor: { has: "PRINT_ORDER" } },
          select: { vendorId: true },
        })
      : Promise.resolve(null),
  ]);

  const vendorIdToAssign = args.vendorId ?? defaultVendor?.vendorId ?? null;
  const [, applied] = await Promise.all([
    vendorIdToAssign
      ? prisma.printOrderVendor.create({
          data: { printOrderId: printOrder.id, vendorId: vendorIdToAssign },
        })
      : Promise.resolve(null),
    autoAssignDefaultWorkflowsCore("print_order", printOrder.id, printOrder.eventId),
  ]);
  return { ...printOrder, ...applied };
}

export type UpdatePrintOrderArgs = {
  name: string;
  notes: string | null;
  roomId: string | null;
  specificLocation: string | null;
};

export async function updatePrintOrderCore(
  id: string,
  eventId: string,
  args: UpdatePrintOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: [args.roomId] });
  return prisma.printOrder.update({
    where: { id, eventId },
    data: {
      name: args.name,
      notes: args.notes,
      roomId: args.roomId,
      specificLocation: args.specificLocation,
      updatedById: userId,
    },
  });
}

// Order-level packing status — cascade to every item in the same transaction.
export async function updatePrintOrderPackingStatusCore(
  printOrderId: string,
  eventId: string,
  packingStatus: PackingStatus | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  await prisma.$transaction(async (tx) => {
    await tx.printOrder.update({
      where: { id: printOrderId },
      data: { packingStatus, updatedById: userId },
    });
    if (packingStatus) {
      await tx.printItem.updateMany({
        where: { printOrderId },
        data: { packingStatus },
      });
    }
  });
}

export async function deletePrintOrderCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "DELETE", eventId);
  await prisma.printOrder.delete({ where: { id, eventId } });
}

export async function deletePrintOrdersCore(ids: string[], eventId: string, userId: string) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "DELETE", eventId);
  const r = await prisma.printOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  return { count: r.count };
}

export type BulkPrintOrderUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  packingStatus?: PackingStatus | null;
  vendorId?: string;
  functionId?: string;
};

export async function bulkUpdatePrintOrdersCore(
  ids: string[],
  eventId: string,
  updates: BulkPrintOrderUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { vendorIds: [updates.vendorId], functionIds: [updates.functionId] });
  // Items and junction rows below are written per id: keep only this event's orders.
  ids = (await prisma.printOrder.findMany({ where: { id: { in: ids }, eventId }, select: { id: true } })).map((o) => o.id);
  const { status, substatus, packingStatus, vendorId, functionId } = updates;

  if (status !== undefined || substatus !== undefined || packingStatus !== undefined) {
    await prisma.$transaction(async (tx) => {
      await tx.printOrder.updateMany({
        where: { id: { in: ids }, eventId },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(substatus !== undefined ? { substatus } : {}),
          ...(packingStatus !== undefined ? { packingStatus } : {}),
          updatedById: userId,
        },
      });
      // Cascade packing status to items when it changes to a concrete value.
      if (packingStatus) {
        await tx.printItem.updateMany({
          where: { printOrderId: { in: ids } },
          data: { packingStatus },
        });
      }
    });
  }

  if (vendorId) {
    // Replace-all on the M:M vendor junction.
    await prisma.printOrderVendor.deleteMany({
      where: { printOrderId: { in: ids }, printOrder: { eventId } },
    });
    await prisma.printOrderVendor.createMany({
      data: ids.map((id) => ({ printOrderId: id, vendorId })),
    });
    await prisma.printOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: { updatedById: userId },
    });
  }

  if (functionId) {
    // Skip-existing add on the M:M function junction.
    const existing = await prisma.printOrderFunction.findMany({
      where: { printOrderId: { in: ids }, functionId },
      select: { printOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.printOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.printOrderFunction.createMany({
        data: toCreate.map((id) => ({ printOrderId: id, functionId })),
      });
      await prisma.printOrder.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: userId },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Links

export async function linkPrintOrderToFunctionCore(
  printOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  await assertEventRefs(eventId, { functionIds: [functionId] });
  const link = await prisma.printOrderFunction.create({
    data: { printOrderId, functionId },
  });
  await bumpPrintOrder(printOrderId, eventId, userId);
  return link;
}

export async function unlinkPrintOrderFromFunctionCore(
  printOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  // printOrder.eventId scope on the delete means a caller can't unlink across events.
  const r = await prisma.printOrderFunction.deleteMany({
    where: { printOrderId, functionId, printOrder: { eventId } },
  });
  await bumpPrintOrder(printOrderId, eventId, userId);
  return { count: r.count };
}

export async function linkPrintOrderToPresentationCore(
  printOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { presentationIds: [presentationId] });
  return prisma.printOrder.update({
    where: { id: printOrderId, eventId },
    data: { presentationId, updatedById: userId },
  });
}

export async function unlinkPrintOrderFromPresentationCore(
  printOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  return prisma.printOrder.update({
    where: { id: printOrderId, eventId },
    data: { presentationId: null, updatedById: userId },
  });
}

export async function unlinkPrintOrdersFromPresentationCore(
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  const r = await prisma.printOrder.updateMany({
    where: { presentationId, eventId },
    data: { presentationId: null, updatedById: userId },
  });
  return { count: r.count };
}

// ---------------------------------------------------------------------------
// PrintItem

export type PrintItemWriteArgs = {
  description: string;
  quantity: number | null;
  acquisitionState: AcquisitionState;
  packingStatus: PackingStatus;
  distributionMethod: string | null;
  distributionNotes: string | null;
  designerVendorId: string | null;
  designerContactId: string | null;
  printerVendorId: string | null;
  printerContactId: string | null;
  notes: string | null;
  // Where this item comes from. Print items can be sourced from a container but
  // can't be one — container lines are supply-side only.
  sourceLocationId: string | null;
};

const printItemRefs = (args: PrintItemWriteArgs) => ({
  vendorIds: [args.designerVendorId, args.printerVendorId],
  contactIds: [args.designerContactId, args.printerContactId],
  storageLocationIds: [args.sourceLocationId],
});

export async function createPrintItemCore(
  printOrderId: string,
  eventId: string,
  args: PrintItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  await assertEventRefs(eventId, printItemRefs(args));
  const { _max } = await prisma.printItem.aggregate({
    where: { printOrderId },
    _max: { sortOrder: true },
  });
  const item = await prisma.printItem.create({
    data: { printOrderId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpPrintOrder(printOrderId, eventId, userId);
  return item;
}

export async function updatePrintItemCore(
  id: string,
  printOrderId: string,
  eventId: string,
  args: PrintItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, printItemRefs(args));
  const item = await prisma.printItem.update({
    where: { id, printOrder: { eventId } },
    data: args,
  });
  await bumpPrintOrder(printOrderId, eventId, userId);
  return item;
}

export async function deletePrintItemCore(
  id: string,
  printOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await prisma.printItem.delete({ where: { id, printOrder: { eventId } } });
  await bumpPrintOrder(printOrderId, eventId, userId);
}

export async function updatePrintItemPackingStatusCore(
  id: string,
  printOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await prisma.printItem.update({
    where: { id, printOrder: { eventId } },
    data: { packingStatus },
  });
  await bumpPrintOrder(printOrderId, eventId, userId);
}

export async function updatePrintItemAcquisitionStateCore(
  id: string,
  printOrderId: string,
  eventId: string,
  acquisitionState: AcquisitionState,
  userId: string,
) {
  await requirePermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId);
  await prisma.printItem.update({
    where: { id, printOrder: { eventId } },
    data: { acquisitionState },
  });
  await bumpPrintOrder(printOrderId, eventId, userId);
}
