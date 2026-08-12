"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import {
  createPrintOrderCore,
  updatePrintOrderCore,
  updatePrintOrderPackingStatusCore,
  deletePrintOrderCore,
  deletePrintOrdersCore,
  bulkUpdatePrintOrdersCore,
  linkPrintOrderToFunctionCore,
  unlinkPrintOrderFromFunctionCore,
  linkPrintOrderToPresentationCore,
  unlinkPrintOrderFromPresentationCore,
  unlinkPrintOrdersFromPresentationCore,
  createPrintItemCore,
  updatePrintItemCore,
  deletePrintItemCore,
  updatePrintItemPackingStatusCore,
  updatePrintItemAcquisitionStateCore,
  type PrintItemWriteArgs,
  type BulkPrintOrderUpdates,
} from "./core";

export async function getPrintOrders(eventId: string) {
  await requirePermission("PRINT_ORDERS", "VIEW", eventId);
  return prisma.printOrder.findMany({
    where: { eventId },
    include: {
      items: true,
      room: { select: { id: true, name: true } },
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
      room: { select: { id: true, name: true } },
      presentation: {
        select: {
          id: true,
          title: true,
          eventId: true,
          speakers: { include: { contact: true }, orderBy: { sortOrder: "asc" } },
        },
      },
      items: {
        include: { sourceLocation: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
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
  const printOrder = await createPrintOrderCore(
    eventId,
    {
      name: (formData.get("name") as string)?.trim(),
      notes: (formData.get("notes") as string) || null,
      roomId: (formData.get("roomId") as string) || null,
      specificLocation: (formData.get("specificLocation") as string) || null,
      functionId: (formData.get("functionId") as string) || null,
      presentationId: (formData.get("presentationId") as string) || null,
      vendorId: (formData.get("vendorId") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/print-orders`);
  redirect(`/events/${eventId}/print-orders/${printOrder.id}`);
}

export async function updatePrintOrder(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await updatePrintOrderCore(
    id,
    eventId,
    {
      name: (formData.get("name") as string)?.trim(),
      notes: (formData.get("notes") as string) || null,
      roomId: (formData.get("roomId") as string) || null,
      specificLocation: (formData.get("specificLocation") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/print-orders`);
  revalidatePath(`/events/${eventId}/print-orders/${id}`);
  redirect(`/events/${eventId}/print-orders/${id}?success=Print Order updated`);
}

export async function updatePrintOrderPackingStatus(
  id: string,
  eventId: string,
  packingStatus: PackingStatus | null,
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await updatePrintOrderPackingStatusCore(id, eventId, packingStatus, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders`);
  revalidatePath(`/events/${eventId}/print-orders/${id}`);
}

export async function deletePrintOrder(id: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "DELETE", eventId);
  await deletePrintOrderCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders`);
  redirect(`/events/${eventId}/print-orders`);
}

// Function link/unlink (many-to-many via junction)
export async function linkPrintOrderToFunction(printOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await linkPrintOrderToFunctionCore(printOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function unlinkPrintOrderFromFunction(printOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await unlinkPrintOrderFromFunctionCore(printOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

// Presentation link/unlink
export async function linkPrintOrderToPresentation(printOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await linkPrintOrderToPresentationCore(printOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkPrintOrderFromPresentation(printOrderId: string, presentationId: string | null, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await unlinkPrintOrderFromPresentationCore(printOrderId, eventId, session.user.id);
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
  await linkPrintOrderToFunctionCore(printOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkPrintOrderFromFunctionPage(
  printOrderId: string,
  functionId: string,
  eventId: string
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await unlinkPrintOrderFromFunctionCore(printOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Link/unlink actions for the Presentation detail page panel
export async function linkPrintOrderToPresentationFromPresentation(
  printOrderId: string,
  presentationId: string,
  eventId: string
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await linkPrintOrderToPresentationCore(printOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkPrintOrderFromPresentationPage(presentationId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await unlinkPrintOrdersFromPresentationCore(presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

function parsePrintItemData(formData: FormData): PrintItemWriteArgs {
  return {
    description: (formData.get("description") as string)?.trim(),
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
    acquisitionState: ((formData.get("acquisitionState") as string) || "TO_PROCURE") as AcquisitionState,
    packingStatus: ((formData.get("packingStatus") as string) || "NEEDED") as PackingStatus,
    distributionMethod: (formData.get("distributionMethod") as string) || null,
    distributionNotes: (formData.get("distributionNotes") as string) || null,
    designerVendorId: (formData.get("designerVendorId") as string) || null,
    designerContactId: (formData.get("designerContactId") as string) || null,
    printerVendorId: (formData.get("printerVendorId") as string) || null,
    printerContactId: (formData.get("printerContactId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    sourceLocationId: (formData.get("sourceLocationId") as string) || null,
  };
}

// PrintItem CRUD
export async function createPrintItem(printOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await createPrintItemCore(printOrderId, eventId, parsePrintItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintItem(id: string, printOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await updatePrintItemCore(id, printOrderId, eventId, parsePrintItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function deletePrintItem(id: string, printOrderId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await deletePrintItemCore(id, printOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintItemPackingStatus(
  id: string,
  printOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await updatePrintItemPackingStatusCore(id, printOrderId, eventId, packingStatus, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  revalidatePath(`/events/${eventId}/packing`);
}

export async function updatePrintItemAcquisitionState(
  id: string,
  printOrderId: string,
  eventId: string,
  acquisitionState: AcquisitionState,
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await updatePrintItemAcquisitionStateCore(id, printOrderId, eventId, acquisitionState, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  revalidatePath(`/events/${eventId}/packing`);
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
  const session = await requirePermission("PRINT_ORDERS", "DELETE", eventId);
  await deletePrintOrdersCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders`);
}

export async function bulkUpdatePrintOrders(
  ids: string[],
  eventId: string,
  updates: BulkPrintOrderUpdates,
) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await bulkUpdatePrintOrdersCore(ids, eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders`);
}
