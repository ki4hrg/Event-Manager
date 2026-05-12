"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";

export async function getPrintOrders(eventId: string) {
  return prisma.printOrder.findMany({
    where: { eventId },
    include: {
      items: true,
      functions: { include: { function: { select: { id: true, name: true } } } },
      presentation: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getPrintOrder(id: string) {
  return prisma.printOrder.findUnique({
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
    },
  });
}

export async function createPrintOrder(eventId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const notes = (formData.get("notes") as string) || null;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const printOrder = await prisma.printOrder.create({
    data: { name, eventId, notes, presentationId },
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
    autoAssignDefaultWorkflows("print_order", printOrder.id),
  ]);
  revalidatePath(`/events/${eventId}/print-orders`);
  redirect(`/events/${eventId}/print-orders/${printOrder.id}`);
}

export async function updatePrintOrder(id: string, eventId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const notes = (formData.get("notes") as string) || null;

  await prisma.printOrder.update({ where: { id }, data: { name, notes } });
  revalidatePath(`/events/${eventId}/print-orders`);
  revalidatePath(`/events/${eventId}/print-orders/${id}`);
  redirect(`/events/${eventId}/print-orders/${id}?success=Print Order updated`);
}

export async function deletePrintOrder(id: string, eventId: string) {
  await prisma.printOrder.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/print-orders`);
  redirect(`/events/${eventId}/print-orders`);
}

// Function link/unlink (many-to-many via junction)
export async function linkPrintOrderToFunction(printOrderId: string, functionId: string, eventId: string) {
  await prisma.printOrderFunction.create({ data: { printOrderId, functionId } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function unlinkPrintOrderFromFunction(printOrderId: string, functionId: string, eventId: string) {
  await prisma.printOrderFunction.deleteMany({ where: { printOrderId, functionId } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

// Presentation link/unlink
export async function linkPrintOrderToPresentation(printOrderId: string, presentationId: string, eventId: string) {
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { presentationId } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkPrintOrderFromPresentation(printOrderId: string, presentationId: string | null, eventId: string) {
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { presentationId: null } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
  if (presentationId) {
    revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  }
}

export async function getAvailablePrintOrdersForPresentation(eventId: string) {
  return prisma.printOrder.findMany({
    where: { eventId, presentationId: null },
    orderBy: { createdAt: "asc" },
  });
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
  const { _max } = await prisma.printItem.aggregate({ where: { printOrderId }, _max: { sortOrder: true } });
  await prisma.printItem.create({
    data: { printOrderId, ...parsePrintItemData(formData), sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintItem(id: string, printOrderId: string, eventId: string, formData: FormData) {
  await prisma.printItem.update({ where: { id }, data: parsePrintItemData(formData) });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function deletePrintItem(id: string, printOrderId: string, eventId: string) {
  await prisma.printItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function getPrintOrderPartyOptions(printOrderId: string) {
  const [orderVendors, printOrder] = await Promise.all([
    prisma.printOrderVendor.findMany({
      where: { printOrderId },
      select: { vendor: { select: { id: true, name: true } } },
      orderBy: { vendor: { name: "asc" } },
    }),
    prisma.printOrder.findUnique({
      where: { id: printOrderId },
      select: {
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
    }),
  ]);

  const vendors = orderVendors.map((v) => v.vendor);

  const contactMap = new Map<string, { id: string; firstName: string; lastName: string; organization: string | null }>();
  for (const s of printOrder?.presentation?.speakers ?? []) {
    contactMap.set(s.contact.id, {
      id: s.contact.id,
      firstName: s.contact.firstName,
      lastName: s.contact.lastName,
      organization: s.contact.organization,
    });
  }
  for (const pof of printOrder?.functions ?? []) {
    for (const fc of pof.function.contacts) {
      contactMap.set(fc.contact.id, {
        id: fc.contact.id,
        firstName: fc.contact.firstName,
        lastName: fc.contact.lastName,
        organization: fc.contact.organization,
      });
    }
  }

  return { vendors, contacts: Array.from(contactMap.values()) };
}
