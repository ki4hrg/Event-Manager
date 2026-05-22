"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { AcquisitionState, EntityStatus, PackingStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

async function assertSupplyOrderInEvent(supplyOrderId: string, eventId: string) {
  const found = await prisma.supplyOrder.findUnique({
    where: { id: supplyOrderId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}

async function bumpSupplyOrder(supplyOrderId: string, userId: string) {
  await prisma.supplyOrder.update({ where: { id: supplyOrderId }, data: { updatedById: userId } });
}

export async function getSupplyOrders(eventId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrder.findMany({
    where: { eventId },
    include: {
      room: { select: { id: true, name: true } },
      items: { select: { id: true, packingStatus: true, acquisitionState: true } },
      functions: { include: { function: { select: { id: true, name: true } } } },
      presentations: { include: { presentation: { select: { id: true, title: true } } } },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSupplyOrder(id: string) {
  const row = await prisma.supplyOrder.findUnique({
    where: { id },
    include: {
      room: { select: { id: true, name: true } },
      functions: {
        include: {
          function: {
            include: {
              schedules: { orderBy: { startTime: "asc" } },
              contacts: { include: { contact: true } },
            },
          },
        },
        orderBy: { function: { name: "asc" } },
      },
      presentations: {
        include: {
          presentation: {
            select: {
              id: true,
              title: true,
              eventId: true,
              speakers: { include: { contact: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
        orderBy: { presentation: { title: "asc" } },
      },
      items: {
        include: {
          equipment: true,
          providerVendor: { select: { id: true, name: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      vendors: { include: { vendor: true }, orderBy: { vendor: { name: "asc" } } },
      files: { orderBy: { createdAt: "asc" } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("SUPPLY_ORDERS", "VIEW", row.eventId);
  return row;
}

export async function createSupplyOrder(eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  const name = (formData.get("name") as string)?.trim();
  const roomId = (formData.get("roomId") as string) || "";
  const specificLocation = (formData.get("specificLocation") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  if (!roomId) {
    throw new Error("Destination room is required.");
  }

  const defaults = await resolveCreateStatus(eventId, "SUPPLY_ORDER");

  const supplyOrder = await prisma.supplyOrder.create({
    data: {
      name,
      eventId,
      roomId,
      specificLocation,
      notes,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: session.user.id,
    },
  });

  if (functionId) {
    await prisma.supplyOrderFunction.create({ data: { supplyOrderId: supplyOrder.id, functionId } });
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  }

  if (presentationId) {
    await prisma.supplyOrderPresentation.create({ data: { supplyOrderId: supplyOrder.id, presentationId } });
    revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  }

  const vendorIdToAssign = selectedVendorId ?? (await getDefaultVendorForModel(eventId, "SUPPLY_ORDER"))?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.supplyOrderVendor.create({ data: { supplyOrderId: supplyOrder.id, vendorId: vendorIdToAssign } });
  }

  await autoAssignDefaultWorkflows("supply_order", supplyOrder.id, eventId);
  revalidatePath(`/events/${eventId}/supply-orders`);
  redirect(`/events/${eventId}/supply-orders/${supplyOrder.id}?success=Supply Order created`);
}

export async function updateSupplyOrder(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  const name = (formData.get("name") as string)?.trim();
  const roomId = (formData.get("roomId") as string) || "";
  const specificLocation = (formData.get("specificLocation") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!roomId) {
    throw new Error("Destination room is required.");
  }

  await prisma.supplyOrder.update({
    where: { id, eventId },
    data: { name, roomId, specificLocation, notes, updatedById: session.user.id },
  });

  revalidatePath(`/events/${eventId}/supply-orders`);
  revalidatePath(`/events/${eventId}/supply-orders/${id}`);
  redirect(`/events/${eventId}/supply-orders/${id}?success=Supply Order updated`);
}

export async function deleteSupplyOrder(id: string, eventId: string) {
  await requirePermission("SUPPLY_ORDERS", "DELETE", eventId);
  await prisma.supplyOrder.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}/supply-orders`);
  redirect(`/events/${eventId}/supply-orders`);
}

export async function deleteSupplyOrders(ids: string[], eventId: string) {
  await requirePermission("SUPPLY_ORDERS", "DELETE", eventId);
  await prisma.supplyOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/supply-orders`);
}

// Order-level packing status — cascade to every item in the same transaction.
export async function updateSupplyOrderPackingStatus(
  supplyOrderId: string,
  eventId: string,
  packingStatus: PackingStatus | null,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);

  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: supplyOrderId },
      data: { packingStatus, updatedById: session.user.id },
    });
    if (packingStatus) {
      await tx.supplyOrderItem.updateMany({
        where: { supplyOrderId },
        data: { packingStatus },
      });
    }
  });

  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

// Function link/unlink (many-to-many via junction)
export async function linkSupplyOrderToFunction(supplyOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await prisma.supplyOrderFunction.create({ data: { supplyOrderId, functionId } });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSupplyOrderFromFunction(supplyOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderFunction.deleteMany({
    where: { supplyOrderId, functionId, supplyOrder: { eventId } },
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Presentation link/unlink (many-to-many via junction)
export async function linkSupplyOrderToPresentation(supplyOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await prisma.supplyOrderPresentation.create({ data: { supplyOrderId, presentationId } });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSupplyOrderFromPresentation(supplyOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderPresentation.deleteMany({
    where: { supplyOrderId, presentationId, supplyOrder: { eventId } },
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// "From parent" variants — revalidate the parent path (function or presentation)
// instead of the supply order, since they're invoked from the parent's detail page.
export async function linkSupplyOrderToFunctionFromFunction(
  supplyOrderId: string,
  functionId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await prisma.supplyOrderFunction.create({ data: { supplyOrderId, functionId } });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSupplyOrderFromFunctionPage(
  supplyOrderId: string,
  functionId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderFunction.deleteMany({
    where: { supplyOrderId, functionId, supplyOrder: { eventId } },
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkSupplyOrderToPresentationFromPresentation(
  supplyOrderId: string,
  presentationId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await prisma.supplyOrderPresentation.create({ data: { supplyOrderId, presentationId } });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSupplyOrderFromPresentationPage(
  supplyOrderId: string,
  presentationId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderPresentation.deleteMany({
    where: { supplyOrderId, presentationId, supplyOrder: { eventId } },
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableSupplyOrdersForFunction(eventId: string, functionId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrder.findMany({
    where: { eventId, functions: { none: { functionId } } },
    include: {
      room: { select: { id: true, name: true } },
      vendors: { include: { vendor: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getAvailableSupplyOrdersForPresentation(eventId: string, presentationId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrder.findMany({
    where: { eventId, presentations: { none: { presentationId } } },
    include: {
      room: { select: { id: true, name: true } },
      vendors: { include: { vendor: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

function parseSupplyItemData(formData: FormData) {
  const acquisitionStateRaw = (formData.get("acquisitionState") as string) || "ON_HAND";
  const packingStatusRaw = (formData.get("packingStatus") as string) || "NEEDED";
  const description = (formData.get("description") as string)?.trim() || null;
  const equipmentId = (formData.get("equipmentId") as string) || null;
  if (!description && !equipmentId) {
    throw new Error("Supply item needs a description or an equipment selection.");
  }
  return {
    description,
    equipmentId,
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
    acquisitionState: acquisitionStateRaw as AcquisitionState,
    providerVendorId: (formData.get("providerVendorId") as string) || null,
    packingStatus: packingStatusRaw as PackingStatus,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createSupplyOrderItem(supplyOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  const { _max } = await prisma.supplyOrderItem.aggregate({
    where: { supplyOrderId },
    _max: { sortOrder: true },
  });
  await prisma.supplyOrderItem.create({
    data: {
      supplyOrderId,
      ...parseSupplyItemData(formData),
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function updateSupplyOrderItem(id: string, supplyOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderItem.update({
    where: { id, supplyOrder: { eventId } },
    data: parseSupplyItemData(formData),
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function deleteSupplyOrderItem(id: string, supplyOrderId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderItem.delete({ where: { id, supplyOrder: { eventId } } });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function updateSupplyOrderItemPackingStatus(
  id: string,
  supplyOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderItem.update({
    where: { id, supplyOrder: { eventId } },
    data: { packingStatus },
  });
  await bumpSupplyOrder(supplyOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function bulkUpdateSupplyOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string; presentationId?: string },
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  const { status, substatus, vendorId, functionId, presentationId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.supplyOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
        updatedById: session.user.id,
      },
    });
  }

  if (vendorId) {
    await prisma.supplyOrderVendor.deleteMany({ where: { supplyOrderId: { in: ids }, supplyOrder: { eventId } } });
    await prisma.supplyOrderVendor.createMany({ data: ids.map((id) => ({ supplyOrderId: id, vendorId })) });
    await prisma.supplyOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: { updatedById: session.user.id },
    });
  }

  if (functionId) {
    const existing = await prisma.supplyOrderFunction.findMany({
      where: { supplyOrderId: { in: ids }, functionId },
      select: { supplyOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.supplyOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.supplyOrderFunction.createMany({
        data: toCreate.map((id) => ({ supplyOrderId: id, functionId })),
      });
      await prisma.supplyOrder.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: session.user.id },
      });
    }
  }

  if (presentationId) {
    const existing = await prisma.supplyOrderPresentation.findMany({
      where: { supplyOrderId: { in: ids }, presentationId },
      select: { supplyOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.supplyOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.supplyOrderPresentation.createMany({
        data: toCreate.map((id) => ({ supplyOrderId: id, presentationId })),
      });
      await prisma.supplyOrder.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: session.user.id },
      });
    }
  }

  revalidatePath(`/events/${eventId}/supply-orders`);
}
