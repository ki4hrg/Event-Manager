"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

// Verifies the print order belongs to the claimed event before a create-style
// mutation (where Prisma can't enforce ownership via the where clause).
async function assertPrintOrderInEvent(printOrderId: string, eventId: string) {
  const found = await prisma.printOrder.findUnique({
    where: { id: printOrderId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}

async function bumpPrintOrder(printOrderId: string, userId: string) {
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: userId } });
}

export async function getPrintOrders(eventId: string) {
  await requirePermission("PRINT_ORDERS", "VIEW", eventId);
  return prisma.printOrder.findMany({
    where: { eventId },
    include: {
      items: true,
      functions: { include: { function: { select: { id: true, name: true } } } },
      presentation: { select: { id: true, title: true } },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getPrintOrder(id: string) {
  const row = await prisma.printOrder.findUnique({
    where: { id },
    include: {
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
      presentation: {
        select: {
          id: true,
          title: true,
          eventId: true,
          speakers: { include: { contact: true }, orderBy: { sortOrder: "asc" } },
        },
      },
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      vendors: { include: { vendor: true }, orderBy: { vendor: { name: "asc" } } },
      files: { orderBy: { createdAt: "asc" } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("PRINT_ORDERS", "VIEW", row.eventId);
  return row;
}

export async function createPrintOrder(eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  const name = (formData.get("name") as string)?.trim();
  const notes = (formData.get("notes") as string) || null;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const defaults = await resolveCreateStatus(eventId, "PRINT_ORDER");

  const printOrder = await prisma.printOrder.create({
    data: { name, eventId, notes, presentationId, status: defaults.status, substatus: defaults.substatus, updatedById: session.user.id },
  });

  const [, defaultVendor] = await Promise.all([
    functionId
      ? prisma.printOrderFunction.create({ data: { printOrderId: printOrder.id, functionId } })
      : Promise.resolve(null),
    !selectedVendorId ? getDefaultVendorForModel(eventId, "PRINT_ORDER") : Promise.resolve(null),
  ]);

  const vendorIdToAssign = selectedVendorId ?? defaultVendor?.vendorId ?? null;
  await Promise.all([
    vendorIdToAssign
      ? prisma.printOrderVendor.create({ data: { printOrderId: printOrder.id, vendorId: vendorIdToAssign } })
      : Promise.resolve(null),
    autoAssignDefaultWorkflows("print_order", printOrder.id, eventId),
  ]);
  revalidatePath(`/events/${eventId}/print-orders`);
  redirect(`/events/${eventId}/print-orders/${printOrder.id}`);
}

export async function updatePrintOrder(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  const name = (formData.get("name") as string)?.trim();
  const notes = (formData.get("notes") as string) || null;

  await prisma.printOrder.update({ where: { id, eventId }, data: { name, notes, updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/print-orders`);
  revalidatePath(`/events/${eventId}/print-orders/${id}`);
  redirect(`/events/${eventId}/print-orders/${id}?success=Print Order updated`);
}

export async function deletePrintOrder(id: string, eventId: string) {
  await requirePermission("PRINT_ORDERS", "DELETE", eventId);
  await prisma.printOrder.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}/print-orders`);
  redirect(`/events/${eventId}/print-orders`);
}

// Function link/unlink (many-to-many via junction)
export async function linkPrintOrderToFunction(printOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  await prisma.printOrderFunction.create({ data: { printOrderId, functionId } });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function unlinkPrintOrderFromFunction(printOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrderFunction.deleteMany({ where: { printOrderId, functionId, printOrder: { eventId } } });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

// Presentation link/unlink
export async function linkPrintOrderToPresentation(printOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrder.update({ where: { id: printOrderId, eventId }, data: { presentationId, updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkPrintOrderFromPresentation(printOrderId: string, presentationId: string | null, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrder.update({ where: { id: printOrderId, eventId }, data: { presentationId: null, updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  if (presentationId) {
    revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  }
}

export async function getAvailablePrintOrdersForPresentation(eventId: string) {
  await requirePermission("PRINT_ORDERS", "VIEW", eventId);
  return prisma.printOrder.findMany({
    where: { eventId, presentationId: null },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAvailablePrintOrdersForFunction(eventId: string, functionId: string) {
  await requirePermission("PRINT_ORDERS", "VIEW", eventId);
  return prisma.printOrder.findMany({
    where: { eventId, functions: { none: { functionId } } },
    orderBy: { name: "asc" },
  });
}

// Link/unlink actions for the Function detail page panel
export async function linkPrintOrderToFunctionFromFunction(
  printOrderId: string,
  functionId: string,
  eventId: string
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  await prisma.printOrderFunction.create({ data: { printOrderId, functionId } });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkPrintOrderFromFunctionPage(
  printOrderId: string,
  functionId: string,
  eventId: string
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrderFunction.deleteMany({ where: { printOrderId, functionId, printOrder: { eventId } } });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Link/unlink actions for the Presentation detail page panel
export async function linkPrintOrderToPresentationFromPresentation(
  printOrderId: string,
  presentationId: string,
  eventId: string
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrder.update({ where: { id: printOrderId, eventId }, data: { presentationId, updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkPrintOrderFromPresentationPage(presentationId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrder.updateMany({ where: { presentationId, eventId }, data: { presentationId: null, updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

function parsePrintItemData(formData: FormData) {
  return {
    description: (formData.get("description") as string)?.trim(),
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
    distributionMethod: (formData.get("distributionMethod") as string) || null,
    distributionNotes: (formData.get("distributionNotes") as string) || null,
    designerVendorId: (formData.get("designerVendorId") as string) || null,
    designerContactId: (formData.get("designerContactId") as string) || null,
    printerVendorId: (formData.get("printerVendorId") as string) || null,
    printerContactId: (formData.get("printerContactId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };
}

// PrintItem CRUD
export async function createPrintItem(printOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  const { _max } = await prisma.printItem.aggregate({ where: { printOrderId }, _max: { sortOrder: true } });
  await prisma.printItem.create({
    data: { printOrderId, ...parsePrintItemData(formData), sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintItem(id: string, printOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printItem.update({ where: { id, printOrder: { eventId } }, data: parsePrintItemData(formData) });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function deletePrintItem(id: string, printOrderId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printItem.delete({ where: { id, printOrder: { eventId } } });
  await bumpPrintOrder(printOrderId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function getPrintOrderPartyOptions(printOrderId: string) {
  const printOrder = await prisma.printOrder.findUnique({
      where: { id: printOrderId },
      select: {
        eventId: true,
        presentation: {
          select: {
            speakers: {
              include: { contact: true },
              orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            },
          },
        },
        functions: {
          include: {
            function: {
              include: {
                contacts: { include: { contact: true } },
              },
            },
          },
        },
      },
    });

  if (!printOrder) return { contacts: [] };
  await requirePermission("PRINT_ORDERS", "VIEW", printOrder.eventId);

  const contactMap = new Map<string, { id: string; firstName: string; lastName: string; organization: string | null }>();
  for (const s of printOrder.presentation?.speakers ?? []) {
    contactMap.set(s.contact.id, {
      id: s.contact.id,
      firstName: s.contact.firstName,
      lastName: s.contact.lastName,
      organization: s.contact.organization,
    });
  }
  for (const pof of printOrder.functions ?? []) {
    for (const fc of pof.function.contacts) {
      contactMap.set(fc.contact.id, {
        id: fc.contact.id,
        firstName: fc.contact.firstName,
        lastName: fc.contact.lastName,
        organization: fc.contact.organization,
      });
    }
  }

  return { contacts: Array.from(contactMap.values()) };
}

export async function deletePrintOrders(ids: string[], eventId: string) {
  await requirePermission("PRINT_ORDERS", "DELETE", eventId);
  await prisma.printOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/print-orders`);
}

export async function bulkUpdatePrintOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string }
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  const { status, substatus, vendorId, functionId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.printOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
        updatedById: session.user.id,
      },
    });
  }

  if (vendorId) {
    await prisma.printOrderVendor.deleteMany({ where: { printOrderId: { in: ids }, printOrder: { eventId } } });
    await prisma.printOrderVendor.createMany({ data: ids.map((id) => ({ printOrderId: id, vendorId })) });
    await prisma.printOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: { updatedById: session.user.id },
    });
  }

  if (functionId) {
    // Add function link via junction table (skip if already linked)
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
        data: { updatedById: session.user.id },
      });
    }
  }

  revalidatePath(`/events/${eventId}/print-orders`);
}
