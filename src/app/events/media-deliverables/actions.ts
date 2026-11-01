"use server";

import { withUserErrors } from "@/lib/userErrors";
import { refuseDuplicate } from "@/lib/uniqueRefusal";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { refreshWorkflowStatus } from "@/app/events/workflows/core";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { getResponsibleParties, type ResponsiblePartyPool } from "@/lib/responsibleParties";
import { createMediaDeliverableCore } from "./core";
import { assertEventRefs } from "@/lib/eventRefs";
import { assertIds, formId, formIds, formName, formNote, formRequiredId, formValue } from "@/lib/validation";

async function assertMediaDeliverableInEvent(mediaDeliverableId: string, eventId: string) {
  assertIds(mediaDeliverableId);
  const found = await prisma.mediaDeliverable.findUnique({
    where: { id: mediaDeliverableId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}

// Runs after every write under the deliverable, so it also keeps a status
// that follows an automatic workflow check current (refreshWorkflowStatus).
async function bumpMediaDeliverable(mediaDeliverableId: string, eventId: string, userId: string) {
  await prisma.mediaDeliverable.updateMany({ where: { id: mediaDeliverableId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("media_deliverable", [mediaDeliverableId], eventId);
}

function parseDeliverableData(formData: FormData) {
  const providerVendorId = formId(formData, "providerVendorId");
  const providerContactId = formId(formData, "providerContactId");
  return {
    mediaType: formNote(formData, "mediaType"),
    description: formNote(formData, "description"),
    delivery: formNote(formData, "delivery"),
    notes: formNote(formData, "notes"),
    providerVendorId,
    providerContactId,
  };
}

export async function getMediaDeliverables(eventId: string) {
  await requirePermission("MEDIA_DELIVERABLES", "VIEW", eventId);
  const rows = await prisma.mediaDeliverable.findMany({
    where: { eventId },
    include: {
      functionLinks: { include: { function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } } } },
      presentationLinks: { include: { presentation: { select: { id: true, title: true } } } },
      providerVendor: { select: { id: true, name: true } },
      providerContact: { select: { id: true, firstName: true, lastName: true } },
      contacts: { include: { contact: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { id: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    functions: r.functionLinks.map((l) => l.function),
    presentations: r.presentationLinks.map((l) => l.presentation),
  }));
}

export async function getMediaDeliverable(id: string) {
  const row = await prisma.mediaDeliverable.findUnique({
    where: { id },
    include: {
      functionLinks: {
        include: {
          function: {
            include: {
              schedules: { orderBy: { startTime: "asc" } },
              contacts: { include: { contact: true } },
              breakoutGroup: { select: { name: true } },
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
      providerVendor: true,
      providerContact: true,
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      files: { orderBy: { createdAt: "asc" } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("MEDIA_DELIVERABLES", "VIEW", row.eventId);
  return {
    ...row,
    functions: row.functionLinks.map((l) => l.function),
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createMediaDeliverable(eventId: string, formData: FormData) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  const functionIds = formIds(formData, "functionIds");
  const presentationIds = formIds(formData, "presentationIds");
  const deliverable = await createMediaDeliverableCore(
    eventId,
    {
      name: formName(formData, "name"),
      ...parseDeliverableData(formData),
      functionIds,
      presentationIds,
    },
    session.user.id,
  );

  for (const functionId of functionIds) revalidatePath(`/events/${eventId}/functions/${functionId}`);
  for (const presentationId of presentationIds) revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  revalidatePath(`/events/${eventId}/media-deliverables`);
  redirect(`/events/${eventId}/media-deliverables/${deliverable.id}`);
}

export async function updateMediaDeliverable(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  const name = formName(formData, "name")?.trim();
  const data = parseDeliverableData(formData);
  await assertEventRefs(eventId, { vendorIds: [data.providerVendorId], contactIds: [data.providerContactId] });

  await prisma.mediaDeliverable.update({
    where: { id, eventId },
    data: { name, ...data, updatedById: session.user.id },
  });
  await refreshWorkflowStatus("media_deliverable", [id], eventId);
  revalidatePath(`/events/${eventId}/media-deliverables`);
  revalidatePath(`/events/${eventId}/media-deliverables/${id}`);
  redirect(`/events/${eventId}/media-deliverables/${id}?success=Media Deliverable updated`);
}

export async function deleteMediaDeliverable(id: string, eventId: string) {
  await requirePermission("MEDIA_DELIVERABLES", "DELETE", eventId);
  await prisma.mediaDeliverable.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}/media-deliverables`);
  redirect(`/events/${eventId}/media-deliverables`);
}

// ============================================================================
// Function / Presentation linking (M:N)
// ============================================================================

export async function linkMediaDeliverableToFunction(mediaDeliverableId: string, functionId: string, eventId: string) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  await assertMediaDeliverableInEvent(mediaDeliverableId, eventId);
  await assertEventRefs(eventId, { functionIds: [functionId] });
  await prisma.mediaDeliverableFunction.upsert({
    where: { mediaDeliverableId_functionId: { mediaDeliverableId, functionId } },
    create: { mediaDeliverableId, functionId },
    update: {},
  });
  await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkMediaDeliverableFromFunction(mediaDeliverableId: string, functionId: string, eventId: string) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  assertIds(mediaDeliverableId, functionId);
  await prisma.mediaDeliverableFunction.deleteMany({
    where: { mediaDeliverableId, functionId, mediaDeliverable: { eventId } },
  });
  await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkMediaDeliverableToPresentation(
  mediaDeliverableId: string,
  presentationId: string,
  eventId: string
) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  await assertMediaDeliverableInEvent(mediaDeliverableId, eventId);
  await assertEventRefs(eventId, { presentationIds: [presentationId] });
  await prisma.mediaDeliverablePresentation.upsert({
    where: { mediaDeliverableId_presentationId: { mediaDeliverableId, presentationId } },
    create: { mediaDeliverableId, presentationId },
    update: {},
  });
  await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkMediaDeliverableFromPresentation(
  mediaDeliverableId: string,
  presentationId: string,
  eventId: string
) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  assertIds(mediaDeliverableId, presentationId);
  await prisma.mediaDeliverablePresentation.deleteMany({
    where: { mediaDeliverableId, presentationId, mediaDeliverable: { eventId } },
  });
  await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableMediaDeliverablesForFunction(eventId: string, functionId?: string) {
  await requirePermission("MEDIA_DELIVERABLES", "VIEW", eventId);
  return prisma.mediaDeliverable.findMany({
    where: {
      eventId,
      ...(functionId ? { NOT: { functionLinks: { some: { functionId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getAvailableMediaDeliverablesForPresentation(eventId: string, presentationId?: string) {
  await requirePermission("MEDIA_DELIVERABLES", "VIEW", eventId);
  return prisma.mediaDeliverable.findMany({
    where: {
      eventId,
      ...(presentationId ? { NOT: { presentationLinks: { some: { presentationId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// Aliases used by the Function / Presentation detail page panels.
export async function linkMediaDeliverableToFunctionFromFunction(
  mediaDeliverableId: string,
  functionId: string,
  eventId: string
) {
  await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return linkMediaDeliverableToFunction(mediaDeliverableId, functionId, eventId);
}

export async function unlinkMediaDeliverableFromFunctionPage(
  mediaDeliverableId: string,
  functionId: string,
  eventId: string
) {
  await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return unlinkMediaDeliverableFromFunction(mediaDeliverableId, functionId, eventId);
}

export async function linkMediaDeliverableToPresentationFromPresentation(
  mediaDeliverableId: string,
  presentationId: string,
  eventId: string
) {
  await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return linkMediaDeliverableToPresentation(mediaDeliverableId, presentationId, eventId);
}

export async function unlinkMediaDeliverableFromPresentationPage(
  mediaDeliverableId: string,
  presentationId: string,
  eventId: string
) {
  await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return unlinkMediaDeliverableFromPresentation(mediaDeliverableId, presentationId, eventId);
}

// ============================================================================
// MediaDeliverableContact CRUD
// ============================================================================

export async function addMediaDeliverableContact(mediaDeliverableId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return withUserErrors(async () => {
    await assertMediaDeliverableInEvent(mediaDeliverableId, eventId);
    const contactId = formRequiredId(formData, "contactId", "contact");
    const role = formValue(formData, "role");
    await assertEventRefs(eventId, { contactIds: [contactId] });

    await refuseDuplicate(
      prisma.mediaDeliverableContact.create({
        data: { mediaDeliverableId, contactId, role: role || null },
      }),
      "Already a contact here",
    );
    await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
    revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  });
}

export async function updateMediaDeliverableContact(
  id: string,
  mediaDeliverableId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return withUserErrors(async () => {
    await prisma.mediaDeliverableContact.update({
      where: { id, mediaDeliverable: { eventId } },
      data: { role: formNote(formData, "role") },
    });
    await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
    revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  });
}

export async function removeMediaDeliverableContact(id: string, mediaDeliverableId: string, eventId: string) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  await prisma.mediaDeliverableContact.delete({ where: { id, mediaDeliverable: { eventId } } });
  await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
}

export async function createAndAddMediaDeliverableContact(
  mediaDeliverableId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  return withUserErrors(async () => {
    await assertMediaDeliverableInEvent(mediaDeliverableId, eventId);
    const firstName = formName(formData, "firstName");
    const lastName = formName(formData, "lastName");
    const email = formValue(formData, "email");
    const organization = formValue(formData, "organization");
    const role = formValue(formData, "role");

    // One transaction, so a failed link doesn't leave a new contact behind.
    await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          tenantId: session.tenantId,
          firstName,
          lastName,
          email: email || null,
          organization: organization || null,
          updatedById: session.user.id,
        },
      });
      await tx.mediaDeliverableContact.create({
        data: { mediaDeliverableId, contactId: contact.id, role: role || null },
      });
    });
    await bumpMediaDeliverable(mediaDeliverableId, eventId, session.user.id);
    revalidatePath(`/events/${eventId}/media-deliverables/${mediaDeliverableId}`);
  });
}

// Recomputes the provider (vendor/contact) pool for the create form as the
// user toggles which functions/presentations to link — function contacts and
// presentation speakers become suggested providers once their function or
// presentation is selected. See getResponsibleParties for scope rules.
export async function getMediaDeliverableProviderPool(
  eventId: string,
  functionIds: string[],
  presentationIds: string[]
): Promise<ResponsiblePartyPool> {
  await requirePermission("MEDIA_DELIVERABLES", "VIEW", eventId);
  return getResponsibleParties({
    eventId,
    modelType: "MEDIA_DELIVERABLE",
    functionIds: functionIds.length ? functionIds : undefined,
    presentationIds: presentationIds.length ? presentationIds : undefined,
  });
}

export async function searchContactsForMediaDeliverable(query: string) {
  const session = await requirePermission("CONTACTS", "VIEW");
  return prisma.contact.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { organization: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
  });
}

// ============================================================================
// Bulk operations
// ============================================================================

export async function deleteMediaDeliverables(ids: string[], eventId: string) {
  await requirePermission("MEDIA_DELIVERABLES", "DELETE", eventId);
  await prisma.mediaDeliverable.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/media-deliverables`);
}

export async function bulkUpdateMediaDeliverables(
  ids: string[],
  eventId: string,
  updates: {
    status?: EntityStatus;
    substatus?: string | null;
    providerVendorId?: string | null;
    providerContactId?: string | null;
    mediaType?: string | null;
    functionId?: string;
    presentationId?: string;
  }
) {
  const session = await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  const { status, substatus, providerVendorId, providerContactId, mediaType, functionId, presentationId } = updates;
  await assertEventRefs(eventId, { vendorIds: [providerVendorId], contactIds: [providerContactId], functionIds: [functionId], presentationIds: [presentationId] });
  // Junction rows below are created per id: keep only this event's deliverables.
  ids = (await prisma.mediaDeliverable.findMany({ where: { id: { in: ids }, eventId }, select: { id: true } })).map((d) => d.id);

  const scalarUpdates: Record<string, unknown> = {};
  if (status !== undefined) scalarUpdates.status = status;
  if (substatus !== undefined) scalarUpdates.substatus = substatus;
  if (mediaType !== undefined) scalarUpdates.mediaType = mediaType;
  // Provider is a single-party concept: setting one side clears the other.
  if (providerVendorId !== undefined) {
    scalarUpdates.providerVendorId = providerVendorId;
    if (providerVendorId !== null) scalarUpdates.providerContactId = null;
  }
  if (providerContactId !== undefined) {
    scalarUpdates.providerContactId = providerContactId;
    if (providerContactId !== null) scalarUpdates.providerVendorId = null;
  }
  if (Object.keys(scalarUpdates).length > 0) {
    await prisma.mediaDeliverable.updateMany({
      where: { id: { in: ids }, eventId },
      data: { ...scalarUpdates, updatedById: session.user.id },
    });
  }

  if (functionId) {
    const existing = await prisma.mediaDeliverableFunction.findMany({
      where: { mediaDeliverableId: { in: ids }, functionId },
      select: { mediaDeliverableId: true },
    });
    const existingIds = new Set(existing.map((e) => e.mediaDeliverableId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.mediaDeliverableFunction.createMany({
        data: toCreate.map((id) => ({ mediaDeliverableId: id, functionId })),
      });
      await prisma.mediaDeliverable.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: session.user.id },
      });
    }
  }

  if (presentationId) {
    const existing = await prisma.mediaDeliverablePresentation.findMany({
      where: { mediaDeliverableId: { in: ids }, presentationId },
      select: { mediaDeliverableId: true },
    });
    const existingIds = new Set(existing.map((e) => e.mediaDeliverableId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.mediaDeliverablePresentation.createMany({
        data: toCreate.map((id) => ({ mediaDeliverableId: id, presentationId })),
      });
      await prisma.mediaDeliverable.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: session.user.id },
      });
    }
  }

  // Only a provider or function link can move a checked step; a status-only edit stands.
  if (providerVendorId !== undefined || providerContactId !== undefined || functionId) {
    await refreshWorkflowStatus("media_deliverable", ids, eventId);
  }
  revalidatePath(`/events/${eventId}/media-deliverables`);
}
