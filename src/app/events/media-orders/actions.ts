"use server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel, getResponsiblePartyVendors } from "@/app/vendors/actions";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

export async function getMediaOrders(eventId: string) {
  await requireAuth();
  const rows = await prisma.mediaOrder.findMany({
    where: { eventId },
    include: {
      items: true,
      functionLinks: { include: { function: { select: { id: true, name: true } } } },
      presentationLinks: { include: { presentation: { select: { id: true, title: true } } } },
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

export async function getMediaOrder(id: string) {
  await requireAuth();
  const row = await prisma.mediaOrder.findUnique({
    where: { id },
    include: {
      functionLinks: {
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
      presentationLinks: {
        include: {
          presentation: {
            select: {
              id: true,
              title: true,
              eventId: true,
              speakers: { include: { contact: true }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
            },
          },
        },
        orderBy: { presentation: { title: "asc" } },
      },
      items: {
        include: { advancerVendor: true, advancerContact: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      vendors: { include: { vendor: true }, orderBy: { vendor: { name: "asc" } } },
      files: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    functions: row.functionLinks.map((l) => l.function),
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createMediaOrder(eventId: string, formData: FormData) {
  await requireAuth();
  const name = (formData.get("name") as string)?.trim();
  const notes = (formData.get("notes") as string) || null;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const defaults = await resolveCreateStatus(eventId, "MEDIA_ORDER");

  const mediaOrder = await prisma.mediaOrder.create({
    data: { name, eventId, notes, status: defaults.status, substatus: defaults.substatus },
  });

  const [, , defaultVendor] = await Promise.all([
    functionId
      ? prisma.mediaOrderFunction.create({ data: { mediaOrderId: mediaOrder.id, functionId } })
      : Promise.resolve(null),
    presentationId
      ? prisma.mediaOrderPresentation.create({ data: { mediaOrderId: mediaOrder.id, presentationId } })
      : Promise.resolve(null),
    !selectedVendorId ? getDefaultVendorForModel(eventId, "MEDIA_ORDER") : Promise.resolve(null),
  ]);

  const vendorIdToAssign = selectedVendorId ?? defaultVendor?.vendorId ?? null;
  await Promise.all([
    vendorIdToAssign
      ? prisma.mediaOrderVendor.create({ data: { mediaOrderId: mediaOrder.id, vendorId: vendorIdToAssign } })
      : Promise.resolve(null),
    autoAssignDefaultWorkflows("media_order", mediaOrder.id),
  ]);

  if (functionId) revalidatePath(`/events/${eventId}/functions/${functionId}`);
  if (presentationId) revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  revalidatePath(`/events/${eventId}/media-orders`);
  redirect(`/events/${eventId}/media-orders/${mediaOrder.id}`);
}

export async function updateMediaOrder(id: string, eventId: string, formData: FormData) {
  await requireAuth();
  const name = (formData.get("name") as string)?.trim();
  const notes = (formData.get("notes") as string) || null;

  await prisma.mediaOrder.update({ where: { id }, data: { name, notes } });
  revalidatePath(`/events/${eventId}/media-orders`);
  revalidatePath(`/events/${eventId}/media-orders/${id}`);
  redirect(`/events/${eventId}/media-orders/${id}?success=Media Order updated`);
}

export async function deleteMediaOrder(id: string, eventId: string) {
  await requireAuth();
  await prisma.mediaOrder.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/media-orders`);
  redirect(`/events/${eventId}/media-orders`);
}

// ============================================================================
// Function / Presentation linking (M:N)
// ============================================================================

export async function linkMediaOrderToFunction(mediaOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  await prisma.mediaOrderFunction.upsert({
    where: { mediaOrderId_functionId: { mediaOrderId, functionId } },
    create: { mediaOrderId, functionId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkMediaOrderFromFunction(mediaOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  await prisma.mediaOrderFunction.deleteMany({ where: { mediaOrderId, functionId } });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkMediaOrderToPresentation(mediaOrderId: string, presentationId: string, eventId: string) {
  await requireAuth();
  await prisma.mediaOrderPresentation.upsert({
    where: { mediaOrderId_presentationId: { mediaOrderId, presentationId } },
    create: { mediaOrderId, presentationId },
    update: {},
  });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkMediaOrderFromPresentation(mediaOrderId: string, presentationId: string, eventId: string) {
  await requireAuth();
  await prisma.mediaOrderPresentation.deleteMany({ where: { mediaOrderId, presentationId } });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableMediaOrdersForFunction(eventId: string, functionId?: string) {
  await requireAuth();
  return prisma.mediaOrder.findMany({
    where: {
      eventId,
      ...(functionId ? { NOT: { functionLinks: { some: { functionId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getAvailableMediaOrdersForPresentation(eventId: string, presentationId?: string) {
  await requireAuth();
  return prisma.mediaOrder.findMany({
    where: {
      eventId,
      ...(presentationId ? { NOT: { presentationLinks: { some: { presentationId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// Aliases used by the Function / Presentation detail page panels (revalidates the parent page too)
export async function linkMediaOrderToFunctionFromFunction(mediaOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  return linkMediaOrderToFunction(mediaOrderId, functionId, eventId);
}

export async function unlinkMediaOrderFromFunctionPage(mediaOrderId: string, functionId: string, eventId: string) {
  await requireAuth();
  return unlinkMediaOrderFromFunction(mediaOrderId, functionId, eventId);
}

export async function linkMediaOrderToPresentationFromPresentation(
  mediaOrderId: string,
  presentationId: string,
  eventId: string
) {
  await requireAuth();
  return linkMediaOrderToPresentation(mediaOrderId, presentationId, eventId);
}

export async function unlinkMediaOrderFromPresentationPage(mediaOrderId: string, presentationId: string, eventId: string) {
  await requireAuth();
  return unlinkMediaOrderFromPresentation(mediaOrderId, presentationId, eventId);
}

// ============================================================================
// MediaItem CRUD
// ============================================================================

function parseMediaItemData(formData: FormData) {
  return {
    description: (formData.get("description") as string)?.trim(),
    delivery: (formData.get("delivery") as string) || null,
    advancerVendorId: (formData.get("advancerVendorId") as string) || null,
    advancerContactId: (formData.get("advancerContactId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createMediaItem(mediaOrderId: string, eventId: string, formData: FormData) {
  await requireAuth();
  const { _max } = await prisma.mediaItem.aggregate({ where: { mediaOrderId }, _max: { sortOrder: true } });
  await prisma.mediaItem.create({
    data: { mediaOrderId, ...parseMediaItemData(formData), sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
}

export async function updateMediaItem(id: string, mediaOrderId: string, eventId: string, formData: FormData) {
  await requireAuth();
  await prisma.mediaItem.update({ where: { id }, data: parseMediaItemData(formData) });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
}

export async function deleteMediaItem(id: string, mediaOrderId: string, eventId: string) {
  await requireAuth();
  await prisma.mediaItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
}

// ============================================================================
// Party options (for the per-item advancer picker)
// ============================================================================

async function getContactsForMediaOrder(mediaOrderId: string) {
  const mediaOrder = await prisma.mediaOrder.findUnique({
    where: { id: mediaOrderId },
    select: {
      presentationLinks: {
        select: {
          presentation: {
            select: {
              speakers: {
                include: { contact: true },
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
              },
            },
          },
        },
      },
      functionLinks: {
        select: {
          function: { select: { contacts: { include: { contact: true } } } },
        },
      },
    },
  });

  const contactMap = new Map<string, { id: string; firstName: string; lastName: string; organization: string | null }>();
  for (const link of mediaOrder?.presentationLinks ?? []) {
    for (const s of link.presentation.speakers) {
      contactMap.set(s.contact.id, {
        id: s.contact.id,
        firstName: s.contact.firstName,
        lastName: s.contact.lastName,
        organization: s.contact.organization,
      });
    }
  }
  for (const link of mediaOrder?.functionLinks ?? []) {
    for (const fc of link.function.contacts) {
      contactMap.set(fc.contact.id, {
        id: fc.contact.id,
        firstName: fc.contact.firstName,
        lastName: fc.contact.lastName,
        organization: fc.contact.organization,
      });
    }
  }
  return Array.from(contactMap.values());
}

export async function getMediaOrderPartyOptions(
  mediaOrderId: string,
  eventId: string
): Promise<{ responsiblePartyVendors: ResponsiblePartyOptions; contacts: { id: string; firstName: string; lastName: string; organization: string | null }[] }> {
  await requireAuth();
  const [responsiblePartyVendors, contacts] = await Promise.all([
    getResponsiblePartyVendors(eventId, "MEDIA_ORDER"),
    getContactsForMediaOrder(mediaOrderId),
  ]);
  return { responsiblePartyVendors, contacts };
}

// ============================================================================
// Bulk operations
// ============================================================================

export async function deleteMediaOrders(ids: string[], eventId: string) {
  await requireAuth();
  await prisma.mediaOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/media-orders`);
}

export async function bulkUpdateMediaOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string; presentationId?: string }
) {
  await requireAuth();
  const { status, substatus, vendorId, functionId, presentationId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.mediaOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
      },
    });
  }

  if (vendorId) {
    await prisma.mediaOrderVendor.deleteMany({ where: { mediaOrderId: { in: ids } } });
    await prisma.mediaOrderVendor.createMany({ data: ids.map((id) => ({ mediaOrderId: id, vendorId })) });
  }

  if (functionId) {
    const existing = await prisma.mediaOrderFunction.findMany({
      where: { mediaOrderId: { in: ids }, functionId },
      select: { mediaOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.mediaOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.mediaOrderFunction.createMany({
        data: toCreate.map((id) => ({ mediaOrderId: id, functionId })),
      });
    }
  }

  if (presentationId) {
    const existing = await prisma.mediaOrderPresentation.findMany({
      where: { mediaOrderId: { in: ids }, presentationId },
      select: { mediaOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.mediaOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.mediaOrderPresentation.createMany({
        data: toCreate.map((id) => ({ mediaOrderId: id, presentationId })),
      });
    }
  }

  revalidatePath(`/events/${eventId}/media-orders`);
}
