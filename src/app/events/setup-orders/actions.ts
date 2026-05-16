"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

// Verifies the setup order belongs to the claimed event before a create-style mutation
// (where Prisma can't enforce ownership via the where clause).
async function assertSetupOrderInEvent(setupOrderId: string, eventId: string) {
  const found = await prisma.setupOrder.findUnique({
    where: { id: setupOrderId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}

export async function getSetupOrders(eventId: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  const rows = await prisma.setupOrder.findMany({
    where: { eventId },
    include: {
      room: { select: { id: true, name: true } },
      functionLinks: { include: { function: { select: { id: true, name: true } } } },
      presentationLinks: { include: { presentation: { select: { id: true, title: true } } } },
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    functions: r.functionLinks.map((l) => l.function),
    presentations: r.presentationLinks.map((l) => l.presentation),
  }));
}

export async function getSetupOrder(id: string) {
  const row = await prisma.setupOrder.findUnique({
    where: { id },
    include: {
      room: true,
      functionLinks: {
        include: { function: { include: { schedules: { orderBy: { startTime: "asc" } } } } },
      },
      presentationLinks: { include: { presentation: { select: { id: true, title: true, eventId: true } } } },
      tables: { include: { providerVendor: { select: { id: true, name: true } } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
    },
  });
  if (!row) return null;
  await requirePermission("SETUP_ORDERS", "VIEW", row.eventId);
  const functions = row.functionLinks.map((l) => l.function).sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...row,
    functions,
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createSetupOrder(eventId: string, formData: FormData) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  const name = (formData.get("name") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const roomId = (formData.get("roomId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const defaults = await resolveCreateStatus(eventId, "SETUP_ORDER");

  const setupOrder = await prisma.setupOrder.create({
    data: {
      name,
      eventId,
      setupType: setupType || null,
      notes: notes || null,
      roomId,
      status: defaults.status,
      substatus: defaults.substatus,
    },
  });

  if (functionId) {
    await prisma.setupOrderFunction.create({ data: { setupOrderId: setupOrder.id, functionId } });
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  }

  if (presentationId) {
    await prisma.setupOrderPresentation.create({ data: { setupOrderId: setupOrder.id, presentationId } });
    revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  }

  const vendorIdToAssign = selectedVendorId ?? (await getDefaultVendorForModel(eventId, "SETUP_ORDER"))?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.setupOrderVendor.create({ data: { setupOrderId: setupOrder.id, vendorId: vendorIdToAssign } });
  }

  await autoAssignDefaultWorkflows("setup_order", setupOrder.id, eventId);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${setupOrder.id}`);
}

export async function updateSetupOrder(id: string, eventId: string, formData: FormData) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  const name = (formData.get("name") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const roomId = (formData.get("roomId") as string) || null;

  await prisma.setupOrder.update({
    where: { id, eventId },
    data: {
      name,
      setupType: setupType || null,
      notes: notes || null,
      roomId,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders`);
  revalidatePath(`/events/${eventId}/setup-orders/${id}`);
  redirect(`/events/${eventId}/setup-orders/${id}?success=Setup Order updated`);
}

export async function deleteSetupOrder(id: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "DELETE", eventId);
  await prisma.setupOrder.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders`);
}

export async function duplicateSetupOrder(id: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  const source = await prisma.setupOrder.findUnique({
    where: { id, eventId },
    include: {
      tables: true,
      equipmentItems: true,
    },
  });
  if (!source) throw new Error("Setup order not found");

  const duplicate = await prisma.setupOrder.create({
    data: {
      eventId,
      name: source.name ? `${source.name} (Copy)` : null,
      setupType: source.setupType,
      notes: source.notes,
      roomId: source.roomId,
    },
  });

  await Promise.all([
    prisma.setupTable.createMany({
      data: source.tables.map((t) => ({
        setupOrderId: duplicate.id,
        quantity: t.quantity,
        tableType: t.tableType,
        chairCount: t.chairCount,
        chairType: t.chairType,
        providerVendorId: t.providerVendorId,
        notes: t.notes,
        sortOrder: t.sortOrder,
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

  await autoAssignDefaultWorkflows("setup_order", duplicate.id, eventId);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${duplicate.id}`);
}

// Link/unlink (M:N via SetupOrderFunction / SetupOrderPresentation)
export async function linkSetupOrderToFunction(setupOrderId: string, functionId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await prisma.setupOrderFunction.upsert({
    where: { setupOrderId_functionId: { setupOrderId, functionId } },
    create: { setupOrderId, functionId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunction(setupOrderId: string, functionId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await prisma.setupOrderFunction.deleteMany({ where: { setupOrderId, functionId } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function getAvailableSetupOrdersForFunction(eventId: string, functionId?: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  return prisma.setupOrder.findMany({
    where: {
      eventId,
      ...(functionId ? { NOT: { functionLinks: { some: { functionId } } } } : {}),
    },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkSetupOrderToFunctionFromFunction(
  setupOrderId: string,
  functionId: string,
  eventId: string
) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return linkSetupOrderToFunction(setupOrderId, functionId, eventId);
}

export async function unlinkSetupOrderFromFunctionPage(setupOrderId: string, functionId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return unlinkSetupOrderFromFunction(setupOrderId, functionId, eventId);
}

export async function linkSetupOrderToPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await prisma.setupOrderPresentation.upsert({
    where: { setupOrderId_presentationId: { setupOrderId, presentationId } },
    create: { setupOrderId, presentationId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSetupOrderFromPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await prisma.setupOrderPresentation.deleteMany({ where: { setupOrderId, presentationId } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableSetupOrdersForPresentation(eventId: string, presentationId?: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  return prisma.setupOrder.findMany({
    where: {
      eventId,
      ...(presentationId ? { NOT: { presentationLinks: { some: { presentationId } } } } : {}),
    },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkSetupOrderToPresentationFromPresentation(
  setupOrderId: string,
  presentationId: string,
  eventId: string
) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return linkSetupOrderToPresentation(setupOrderId, presentationId, eventId);
}

export async function unlinkSetupOrderFromPresentationPage(setupOrderId: string, presentationId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return unlinkSetupOrderFromPresentation(setupOrderId, presentationId, eventId);
}

// SetupTable CRUD
export async function createSetupTable(setupOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  const { _max } = await prisma.setupTable.aggregate({ where: { setupOrderId }, _max: { sortOrder: true } });

  await prisma.setupTable.create({
    data: {
      setupOrderId,
      quantity: parseInt(formData.get("quantity") as string),
      tableType: (formData.get("tableType") as string) || null,
      chairCount: formData.get("chairCount") ? parseInt(formData.get("chairCount") as string) : null,
      chairType: (formData.get("chairType") as string) || null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupTable(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await prisma.setupTable.update({
    where: { id, setupOrder: { eventId } },
    data: {
      quantity: parseInt(formData.get("quantity") as string),
      tableType: (formData.get("tableType") as string) || null,
      chairCount: formData.get("chairCount") ? parseInt(formData.get("chairCount") as string) : null,
      chairType: (formData.get("chairType") as string) || null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupTable(id: string, setupOrderId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await prisma.setupTable.delete({ where: { id, setupOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

// EquipmentItem CRUD for Setup Orders
export async function createSetupEquipmentItem(setupOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  const { _max } = await prisma.equipmentItem.aggregate({ where: { setupOrderId }, _max: { sortOrder: true } });
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.create({
    data: {
      setupOrderId,
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupEquipmentItem(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.update({
    where: { id, setupOrder: { eventId } },
    data: {
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupEquipmentItem(id: string, setupOrderId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, setupOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupOrders(ids: string[], eventId: string) {
  await requirePermission("SETUP_ORDERS", "DELETE", eventId);
  await prisma.setupOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/setup-orders`);
}

export async function bulkUpdateSetupOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  const { status, substatus, vendorId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.setupOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
      },
    });
  }

  if (vendorId) {
    await prisma.setupOrderVendor.deleteMany({ where: { setupOrderId: { in: ids }, setupOrder: { eventId } } });
    await prisma.setupOrderVendor.createMany({ data: ids.map((id) => ({ setupOrderId: id, vendorId })) });
  }

  revalidatePath(`/events/${eventId}/setup-orders`);
}
