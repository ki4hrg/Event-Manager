// Pure cores for setup-order + setup-table + setup-detail + setup-equipment +
// link mutations. NOT a "use server" file — see src/app/contacts/core.ts for
// the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError } from "@/lib/permissions";
import { catalogIdForName, resolveEquipmentName } from "@/lib/equipment-utils";
import { assertEventRefs, partyRefs } from "@/lib/eventRefs";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { autoAssignDefaultWorkflowsCore, refreshWorkflowStatus } from "@/app/events/workflows/core";

async function assertSetupOrderInEvent(setupOrderId: string, eventId: string) {
  const found = await prisma.setupOrder.findUnique({
    where: { id: setupOrderId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

// Runs after every write under the order, so it also keeps a status that
// follows an automatic workflow check current (refreshWorkflowStatus).
async function bumpSetupOrder(setupOrderId: string, eventId: string, userId: string) {
  await prisma.setupOrder.updateMany({ where: { id: setupOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("setup_order", [setupOrderId], eventId);
}

// ---------------------------------------------------------------------------
// SetupOrder

export type CreateSetupOrderArgs = {
  name: string | null;
  setupType: string | null;
  notes: string | null;
  roomId: string | null;
  // Optional initial M:M links + vendor pin (falls back to event default).
  functionId: string | null;
  presentationId: string | null;
  vendorId: string | null;
};

export async function createSetupOrderCore(
  eventId: string,
  args: CreateSetupOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: [args.roomId], functionIds: [args.functionId], presentationIds: [args.presentationId], vendorIds: [args.vendorId] });
  const defaults = await resolveCreateStatus(eventId, "SETUP_ORDER");

  const setupOrder = await prisma.setupOrder.create({
    data: {
      name: args.name,
      eventId,
      setupType: args.setupType,
      notes: args.notes,
      roomId: args.roomId,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
    },
  });

  if (args.functionId) {
    await prisma.setupOrderFunction.create({
      data: { setupOrderId: setupOrder.id, functionId: args.functionId },
    });
  }
  if (args.presentationId) {
    await prisma.setupOrderPresentation.create({
      data: { setupOrderId: setupOrder.id, presentationId: args.presentationId },
    });
  }

  const fallback = !args.vendorId
    ? await prisma.eventVendor.findFirst({
        where: { eventId, defaultFor: { has: "SETUP_ORDER" } },
        select: { vendorId: true },
      })
    : null;
  const vendorIdToAssign = args.vendorId ?? fallback?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.setupOrderVendor.create({
      data: { setupOrderId: setupOrder.id, vendorId: vendorIdToAssign },
    });
  }

  const applied = await autoAssignDefaultWorkflowsCore("setup_order", setupOrder.id, setupOrder.eventId);
  return { ...setupOrder, ...applied };
}

export type UpdateSetupOrderArgs = {
  name: string | null;
  setupType: string | null;
  notes: string | null;
  roomId: string | null;
};

export async function updateSetupOrderCore(
  id: string,
  eventId: string,
  args: UpdateSetupOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: [args.roomId] });
  return prisma.setupOrder.update({
    where: { id, eventId },
    data: {
      name: args.name,
      setupType: args.setupType,
      notes: args.notes,
      roomId: args.roomId,
      updatedById: userId,
    },
  });
}

export async function deleteSetupOrderCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "DELETE", eventId);
  await prisma.setupOrder.delete({ where: { id, eventId } });
}

export async function deleteSetupOrdersCore(ids: string[], eventId: string, userId: string) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "DELETE", eventId);
  const r = await prisma.setupOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  return { count: r.count };
}

export async function duplicateSetupOrderCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  const source = await prisma.setupOrder.findUnique({
    where: { id, eventId },
    include: { tables: true, details: true, equipmentItems: true },
  });
  if (!source) throw new PermissionError("NOT_FOUND");

  const duplicate = await prisma.setupOrder.create({
    data: {
      eventId,
      name: source.name ? `${source.name} (Copy)` : null,
      setupType: source.setupType,
      notes: source.notes,
      roomId: source.roomId,
      updatedById: userId,
    },
  });

  await Promise.all([
    prisma.setupTable.createMany({
      data: source.tables.map((t) => ({
        setupOrderId: duplicate.id,
        quantity: t.quantity,
        tableType: t.tableType,
        tableEquipmentId: t.tableEquipmentId,
        chairCount: t.chairCount,
        chairType: t.chairType,
        chairEquipmentId: t.chairEquipmentId,
        providerVendorId: t.providerVendorId,
        notes: t.notes,
        sortOrder: t.sortOrder,
      })),
    }),
    prisma.setupOrderDetail.createMany({
      data: source.details.map((d) => ({
        setupOrderId: duplicate.id,
        headline: d.headline,
        description: d.description,
        responsiblePartyVendorId: d.responsiblePartyVendorId,
        sortOrder: d.sortOrder,
      })),
    }),
    prisma.equipmentItem.createMany({
      data: source.equipmentItems.map((e) => ({
        setupOrderId: duplicate.id,
        item: e.item,
        quantity: e.quantity,
        notes: e.notes,
        sortOrder: e.sortOrder,
      })),
    }),
  ]);

  const applied = await autoAssignDefaultWorkflowsCore("setup_order", duplicate.id, duplicate.eventId);
  return { ...duplicate, ...applied };
}

export type BulkSetupOrderUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  vendorId?: string;
};

export async function bulkUpdateSetupOrdersCore(
  ids: string[],
  eventId: string,
  updates: BulkSetupOrderUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { vendorIds: [updates.vendorId] });
  // Junction rows below are created per id: keep only this event's orders.
  ids = (await prisma.setupOrder.findMany({ where: { id: { in: ids }, eventId }, select: { id: true } })).map((o) => o.id);
  const { status, substatus, vendorId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.setupOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
        updatedById: userId,
      },
    });
  }

  if (vendorId) {
    await prisma.setupOrderVendor.deleteMany({
      where: { setupOrderId: { in: ids }, setupOrder: { eventId } },
    });
    await prisma.setupOrderVendor.createMany({
      data: ids.map((id) => ({ setupOrderId: id, vendorId })),
    });
    await prisma.setupOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: { updatedById: userId },
    });
  }
  // Only a vendor or link change can move a checked step; a status-only edit stands.
  if (vendorId) await refreshWorkflowStatus("setup_order", ids, eventId);
}

// ---------------------------------------------------------------------------
// Links

export async function linkSetupOrderToFunctionCore(
  setupOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await assertEventRefs(eventId, { functionIds: [functionId] });
  const link = await prisma.setupOrderFunction.upsert({
    where: { setupOrderId_functionId: { setupOrderId, functionId } },
    create: { setupOrderId, functionId },
    update: {},
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return link;
}

export async function unlinkSetupOrderFromFunctionCore(
  setupOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  // Belt + suspenders: the assert below already verifies setupOrder is in
  // event, but the explicit `setupOrder: { eventId }` scope on the delete
  // matches the print/supply patterns and makes the query self-protecting
  // against any future regression in assertSetupOrderInEvent.
  await assertSetupOrderInEvent(setupOrderId, eventId);
  const r = await prisma.setupOrderFunction.deleteMany({
    where: { setupOrderId, functionId, setupOrder: { eventId } },
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return { count: r.count };
}

export async function linkSetupOrderToPresentationCore(
  setupOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await assertEventRefs(eventId, { presentationIds: [presentationId] });
  const link = await prisma.setupOrderPresentation.upsert({
    where: { setupOrderId_presentationId: { setupOrderId, presentationId } },
    create: { setupOrderId, presentationId },
    update: {},
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return link;
}

export async function unlinkSetupOrderFromPresentationCore(
  setupOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  const r = await prisma.setupOrderPresentation.deleteMany({
    where: { setupOrderId, presentationId, setupOrder: { eventId } },
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return { count: r.count };
}

// ---------------------------------------------------------------------------
// SetupTable

export type SetupTableWriteArgs = {
  quantity: number;
  tableType: string | null;
  chairCount: number | null;
  chairType: string | null;
  providerVendorId: string | null;
  notes: string | null;
};

// The table and chair types as named, linked to the catalog rows they name.
async function tableData(args: SetupTableWriteArgs, eventId: string) {
  const [tableEquipmentId, chairEquipmentId] = await Promise.all([
    catalogIdForName(args.tableType, "Tables", eventId),
    catalogIdForName(args.chairType, "Chairs", eventId),
  ]);
  return { ...args, tableEquipmentId, chairEquipmentId };
}

export async function createSetupTableCore(
  setupOrderId: string,
  eventId: string,
  args: SetupTableWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await assertEventRefs(eventId, { vendorIds: [args.providerVendorId] });
  const { _max } = await prisma.setupTable.aggregate({
    where: { setupOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.setupTable.create({
    data: { setupOrderId, ...(await tableData(args, eventId)), sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return row;
}

export async function updateSetupTableCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  args: SetupTableWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { vendorIds: [args.providerVendorId] });
  const row = await prisma.setupTable.update({
    where: { id, setupOrder: { eventId } },
    data: await tableData(args, eventId),
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return row;
}

export async function deleteSetupTableCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await prisma.setupTable.delete({ where: { id, setupOrder: { eventId } } });
  await bumpSetupOrder(setupOrderId, eventId, userId);
}

// ---------------------------------------------------------------------------
// SetupOrderDetail

export type SetupOrderDetailWriteArgs = {
  headline: string | null;
  description: string;
  responsiblePartyVendorId: string | null;
};

export async function createSetupOrderDetailCore(
  setupOrderId: string,
  eventId: string,
  args: SetupOrderDetailWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await assertEventRefs(eventId, { vendorIds: [args.responsiblePartyVendorId] });
  const { _max } = await prisma.setupOrderDetail.aggregate({
    where: { setupOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.setupOrderDetail.create({
    data: { setupOrderId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return row;
}

export async function updateSetupOrderDetailCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  args: SetupOrderDetailWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { vendorIds: [args.responsiblePartyVendorId] });
  const row = await prisma.setupOrderDetail.update({
    where: { id, setupOrder: { eventId } },
    data: args,
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return row;
}

export async function deleteSetupOrderDetailCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await prisma.setupOrderDetail.delete({ where: { id, setupOrder: { eventId } } });
  await bumpSetupOrder(setupOrderId, eventId, userId);
}

// ---------------------------------------------------------------------------
// EquipmentItem (Setup-Order-scoped)

export type SetupEquipmentItemWriteArgs = {
  equipmentId: string | null;
  // When equipmentId is set, item is resolved server-side from the Equipment row
  // and the value here is ignored. When equipmentId is null, `item` is required.
  item: string;
  quantity: number | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

export async function createSetupEquipmentItemCore(
  setupOrderId: string,
  eventId: string,
  rawArgs: SetupEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await assertEventRefs(eventId, partyRefs(rawArgs));
  const item = await resolveEquipmentName(rawArgs.equipmentId, rawArgs.item, eventId);
  const { _max } = await prisma.equipmentItem.aggregate({
    where: { setupOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.equipmentItem.create({
    data: {
      setupOrderId,
      equipmentId: rawArgs.equipmentId,
      item,
      quantity: rawArgs.quantity,
      providerVendorId: rawArgs.providerVendorId,
      providerContactId: rawArgs.providerContactId,
      operatorVendorId: rawArgs.operatorVendorId,
      operatorContactId: rawArgs.operatorContactId,
      notes: rawArgs.notes,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return row;
}

export async function updateSetupEquipmentItemCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  rawArgs: SetupEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, partyRefs(rawArgs));
  const item = await resolveEquipmentName(rawArgs.equipmentId, rawArgs.item, eventId);
  const row = await prisma.equipmentItem.update({
    where: { id, setupOrder: { eventId } },
    data: {
      equipmentId: rawArgs.equipmentId,
      item,
      quantity: rawArgs.quantity,
      providerVendorId: rawArgs.providerVendorId,
      providerContactId: rawArgs.providerContactId,
      operatorVendorId: rawArgs.operatorVendorId,
      operatorContactId: rawArgs.operatorContactId,
      notes: rawArgs.notes,
    },
  });
  await bumpSetupOrder(setupOrderId, eventId, userId);
  return row;
}

export async function deleteSetupEquipmentItemCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SETUP_ORDERS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, setupOrder: { eventId } } });
  await bumpSetupOrder(setupOrderId, eventId, userId);
}
