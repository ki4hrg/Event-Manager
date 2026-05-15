"use server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";

export async function getSetupOrders(eventId: string) {
  await requireAuth();
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
  await requireAuth();
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
  const functions = row.functionLinks.map((l) => l.function).sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...row,
    functions,
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createSetupOrder(eventId: string, formData: FormData) {
  await requireAuth();
  const name = (formData.get("name") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const roomId = (formData.get("roomId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const setupOrder = await prisma.setupOrder.create({
    data: {
      name,
      eventId,
      setupType: setupType || null,
      notes: notes || null,
      roomId,
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

  await autoAssignDefaultWorkflows("setup_order", setupOrder.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${setupOrder.id}`);
}

export async function updateSetupOrder(id: string, eventId: string, formData: FormData) {
  await requireAuth();
  const name = (formData.get("name") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const roomId = (formData.get("roomId") as string) || null;

  await prisma.setupOrder.update({
    where: { id },
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
  await requireAuth();
  await prisma.setupOrder.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders`);
}

export async function duplicateSetupOrder(id: string, eventId: string) {
  await requireAuth();
  const source = await prisma.setupOrder.findUnique({
    where: { id },
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

  await autoAssignDefaultWorkflows("setup_order", duplicate.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${duplicate.id}`);
}

// Link/unlink (M:N via SetupOrderFunction / SetupOrderPresentation)
export async function linkSetupOrderToFunction(setupOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  await prisma.setupOrderFunction.upsert({
    where: { setupOrderId_functionId: { setupOrderId, functionId } },
    create: { setupOrderId, functionId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunction(setupOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  await prisma.setupOrderFunction.deleteMany({ where: { setupOrderId, functionId } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function getAvailableSetupOrdersForFunction(eventId: string, functionId?: string) {
  await requireAuth();
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
  await requireAuth();
  return linkSetupOrderToFunction(setupOrderId, functionId, eventId);
}

export async function unlinkSetupOrderFromFunctionPage(setupOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  return unlinkSetupOrderFromFunction(setupOrderId, functionId, eventId);
}

export async function linkSetupOrderToPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  await requireAuth();
  await prisma.setupOrderPresentation.upsert({
    where: { setupOrderId_presentationId: { setupOrderId, presentationId } },
    create: { setupOrderId, presentationId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSetupOrderFromPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  await requireAuth();
  await prisma.setupOrderPresentation.deleteMany({ where: { setupOrderId, presentationId } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableSetupOrdersForPresentation(eventId: string, presentationId?: string) {
  await requireAuth();
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
  await requireAuth();
  return linkSetupOrderToPresentation(setupOrderId, presentationId, eventId);
}

export async function unlinkSetupOrderFromPresentationPage(setupOrderId: string, presentationId: string, eventId: string) {
  await requireAuth();
  return unlinkSetupOrderFromPresentation(setupOrderId, presentationId, eventId);
}

// SetupTable CRUD
export async function createSetupTable(setupOrderId: string, eventId: string, formData: FormData) {
  await requireAuth();
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
  await requireAuth();
  await prisma.setupTable.update({
    where: { id },
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
  await requireAuth();
  await prisma.setupTable.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

// EquipmentItem CRUD for Setup Orders
export async function createSetupEquipmentItem(setupOrderId: string, eventId: string, formData: FormData) {
  await requireAuth();
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
  await requireAuth();
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.update({
    where: { id },
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
  await requireAuth();
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupOrders(ids: string[], eventId: string) {
  await requireAuth();
  await prisma.setupOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/setup-orders`);
}

export async function bulkUpdateSetupOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
) {
  await requireAuth();
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
    await prisma.setupOrderVendor.deleteMany({ where: { setupOrderId: { in: ids } } });
    await prisma.setupOrderVendor.createMany({ data: ids.map((id) => ({ setupOrderId: id, vendorId })) });
  }

  revalidatePath(`/events/${eventId}/setup-orders`);
}
