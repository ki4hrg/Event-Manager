"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

// Verifies the presentation belongs to the claimed event before a create-style
// mutation (where Prisma can't enforce ownership via the where clause).
async function assertPresentationInEvent(presentationId: string, eventId: string) {
  const found = await prisma.presentation.findUnique({
    where: { id: presentationId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}

// ============================================================================
// Track CRUD (event-scoped)
// ============================================================================

export async function getTracks(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return prisma.presentationTrack.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createTrack(eventId: string, formData: FormData) {
  await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;

  const maxOrder = await prisma.presentationTrack.findFirst({
    where: { eventId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.presentationTrack.create({
    data: {
      name,
      color: color || null,
      eventId,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/presentations`);
}

export async function updateTrack(trackId: string, eventId: string, formData: FormData) {
  await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;

  await prisma.presentationTrack.update({
    where: { id: trackId, eventId },
    data: {
      name,
      color: color || null,
    },
  });

  revalidatePath(`/events/${eventId}/presentations`);
}

export async function deleteTrack(trackId: string, eventId: string) {
  await requirePermission("PRESENTATIONS", "DELETE", eventId);
  await prisma.presentationTrack.delete({ where: { id: trackId, eventId } });
  revalidatePath(`/events/${eventId}/presentations`);
}

// ============================================================================
// Presentation CRUD
// ============================================================================

export async function getPresentations(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return prisma.presentation.findMany({
    where: { eventId },
    include: {
      track: true,
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      slots: {
        include: {
          function: {
            include: { schedules: { orderBy: { startTime: "asc" } } },
          },
          room: true,
        },
      },
    },
    orderBy: [{ title: "asc" }],
  });
}

export async function getPresentation(id: string) {
  const row = await prisma.presentation.findUnique({
    where: { id },
    include: {
      track: true,
      breakoutGroup: true,
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      slots: {
        include: {
          function: {
            include: {
              schedules: { orderBy: { startTime: "asc" } },
              breakoutGroup: true,
            },
          },
          room: true,
          advancerVendor: { select: { id: true, name: true } },
          advancerContact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      advancerVendor: { select: { id: true, name: true } },
      advancerContact: { select: { id: true, firstName: true, lastName: true } },
      avOrderLinks: { include: { avOrder: { select: { id: true, name: true } } } },
      setupOrderLinks: { include: { setupOrder: { select: { id: true, name: true, setupType: true, room: { select: { name: true } } } } } },
      mediaDeliverableLinks: {
        include: {
          mediaDeliverable: {
            select: {
              id: true,
              name: true,
              status: true,
              substatus: true,
              notes: true,
              mediaType: true,
              providerVendor: { select: { name: true } },
              providerContact: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      printOrder: { select: { id: true, name: true } },
      event: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("PRESENTATIONS", "VIEW", row.eventId);
  return {
    ...row,
    avOrders: row.avOrderLinks.map((l) => l.avOrder),
    setupOrders: row.setupOrderLinks.map((l) => l.setupOrder),
    mediaDeliverables: row.mediaDeliverableLinks.map((l) => l.mediaDeliverable),
  };
}

export async function createPresentation(eventId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const trackId = formData.get("trackId") as string;
  const schedulingNotes = formData.get("schedulingNotes") as string;
  const internalNotes = formData.get("internalNotes") as string;

  // Get speaker data from form
  const speakerContactIds = formData.getAll("speakerContactIds") as string[];
  const speakerRoles = formData.getAll("speakerRoles") as string[];
  const primarySpeakerId = formData.get("primarySpeakerId") as string;

  const type = formData.get("type") as string;
  const breakoutGroupId = formData.get("breakoutGroupId") as string;
  const instanceCountRaw = formData.get("instanceCount") as string;
  const advancerVendorId = (formData.get("advancerVendorId") as string) || null;
  const advancerContactId = (formData.get("advancerContactId") as string) || null;

  const defaults = await resolveCreateStatus(eventId, "PRESENTATION");

  const presentation = await prisma.presentation.create({
    data: {
      title,
      type: type || "",
      description: description || null,
      trackId: trackId || null,
      schedulingNotes: schedulingNotes || null,
      internalNotes: internalNotes || null,
      breakoutGroupId: breakoutGroupId || null,
      instanceCount: instanceCountRaw ? parseInt(instanceCountRaw) : 1,
      eventId,
      status: defaults.status,
      substatus: defaults.substatus,
      advancerVendorId,
      advancerContactId,
      updatedById: session.user.id,
    },
  });

  // Create speakers
  if (speakerContactIds.length > 0) {
    await prisma.presentationContact.createMany({
      data: speakerContactIds.map((contactId, index) => ({
        presentationId: presentation.id,
        contactId,
        role: speakerRoles[index] || null,
        isPrimary: contactId === primarySpeakerId,
        sortOrder: index,
      })),
    });
  }

  await autoAssignDefaultWorkflows("presentation", presentation.id, eventId);
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${presentation.id}`);
}

export async function updatePresentationInstanceCount(id: string, eventId: string, count: number) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await prisma.presentation.update({
    where: { id, eventId },
    data: { instanceCount: count, updatedById: session.user.id },
  });
  revalidatePath(`/events/${eventId}/presentations/${id}`);
}

export async function updatePresentation(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const trackId = formData.get("trackId") as string;
  const schedulingNotes = formData.get("schedulingNotes") as string;
  const internalNotes = formData.get("internalNotes") as string;

  const type = formData.get("type") as string;
  const breakoutGroupId = formData.get("breakoutGroupId");
  const instanceCountRaw = formData.get("instanceCount") as string;
  const advancerVendorIdRaw = formData.get("advancerVendorId");
  const advancerContactIdRaw = formData.get("advancerContactId");

  await prisma.presentation.update({
    where: { id, eventId },
    data: {
      title,
      type: type || "",
      description: description || null,
      trackId: trackId || null,
      schedulingNotes: schedulingNotes || null,
      internalNotes: internalNotes || null,
      ...(breakoutGroupId !== null ? { breakoutGroupId: (breakoutGroupId as string) || null } : {}),
      ...(instanceCountRaw ? { instanceCount: parseInt(instanceCountRaw) } : {}),
      ...(advancerVendorIdRaw !== null ? { advancerVendorId: (advancerVendorIdRaw as string) || null } : {}),
      ...(advancerContactIdRaw !== null ? { advancerContactId: (advancerContactIdRaw as string) || null } : {}),
      updatedById: session.user.id,
    },
  });

  revalidatePath(`/events/${eventId}/presentations`);
  revalidatePath(`/events/${eventId}/presentations/${id}`);
  redirect(`/events/${eventId}/presentations/${id}?success=Presentation updated`);
}

export async function deletePresentation(id: string, eventId: string) {
  await requirePermission("PRESENTATIONS", "DELETE", eventId);
  await prisma.presentation.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations`);
}

export async function deletePresentations(ids: string[], eventId: string) {
  await requirePermission("PRESENTATIONS", "DELETE", eventId);
  await prisma.presentation.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function bulkUpdatePresentations(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; trackId?: string | null; type?: string }
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const { status, substatus, trackId, type } = updates;
  await prisma.presentation.updateMany({
    where: { id: { in: ids }, eventId },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(substatus !== undefined ? { substatus } : {}),
      ...(trackId !== undefined ? { trackId } : {}),
      ...(type !== undefined ? { type } : {}),
      updatedById: session.user.id,
    },
  });
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function duplicatePresentation(id: string, eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const original = await prisma.presentation.findUnique({
    where: { id, eventId },
    include: {
      speakers: true,
    },
  });

  if (!original) notFound();

  const duplicate = await prisma.presentation.create({
    data: {
      title: `${original.title} (Copy)`,
      type: original.type,
      description: original.description,
      trackId: original.trackId,
      schedulingNotes: original.schedulingNotes,
      internalNotes: original.internalNotes,
      eventId: original.eventId,
      updatedById: session.user.id,
    },
  });

  // Copy speakers
  if (original.speakers.length > 0) {
    await prisma.presentationContact.createMany({
      data: original.speakers.map((s) => ({
        presentationId: duplicate.id,
        contactId: s.contactId,
        role: s.role,
        isPrimary: s.isPrimary,
        sortOrder: s.sortOrder,
      })),
    });
  }

  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${duplicate.id}`);
}

// ============================================================================
// Speaker CRUD
// ============================================================================

export async function addSpeaker(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await assertPresentationInEvent(presentationId, eventId);
  const contactId = formData.get("contactId") as string;
  const role = formData.get("role") as string;
  const isPrimary = formData.get("isPrimary") === "true";

  const maxOrder = await prisma.presentationContact.findFirst({
    where: { presentationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  if (isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId },
      data: { isPrimary: false },
    });
  }

  await prisma.presentationContact.create({
    data: {
      presentationId,
      contactId,
      role: role || null,
      isPrimary,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updateSpeaker(
  speakerId: string,
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await assertPresentationInEvent(presentationId, eventId);
  const role = formData.get("role") as string;
  const isPrimary = formData.get("isPrimary") === "true";

  if (isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId, id: { not: speakerId } },
      data: { isPrimary: false },
    });
  }

  await prisma.presentationContact.update({
    where: { id: speakerId, presentation: { eventId } },
    data: {
      role: role || null,
      isPrimary,
    },
  });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function removeSpeaker(speakerId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await prisma.presentationContact.delete({ where: { id: speakerId, presentation: { eventId } } });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function createAndAddPresentationSpeaker(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await assertPresentationInEvent(presentationId, eventId);
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organization = formData.get("organization") as string;
  const role = formData.get("role") as string;
  const isPrimary = formData.get("isPrimary") === "true";

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      organization: organization || null,
      updatedById: session.user.id,
    },
  });

  const maxOrder = await prisma.presentationContact.findFirst({
    where: { presentationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  if (isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId },
      data: { isPrimary: false },
    });
  }

  await prisma.presentationContact.create({
    data: {
      presentationId,
      contactId: contact.id,
      role: role || null,
      isPrimary,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function reorderSpeakers(
  presentationId: string,
  eventId: string,
  orderedIds: string[]
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.presentationContact.update({
        where: { id, presentation: { eventId } },
        data: { sortOrder: index },
      })
    )
  );
  await prisma.presentation.update({ where: { id: presentationId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// ============================================================================
// Contact Search (for speaker selection)
// ============================================================================

export async function searchContacts(query: string) {
  await requirePermission("CONTACTS", "VIEW");
  if (!query || query.length < 2) {
    return [];
  }

  return prisma.contact.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { organization: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

// ============================================================================
// CSV Import
// ============================================================================

export type ImportDestination =
  | "presentation.title"
  | "presentation.description"
  | "presentation.schedulingNotes"
  | "presentation.internalNotes"
  | "presentation.instanceCount"
  | "contact.fullName"
  | "contact.firstName"
  | "contact.lastName"
  | "contact.email"
  | "skip";

export type ColumnMapping = Record<string, ImportDestination>;

function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  const lastName = parts.pop()!;
  return { firstName: parts.join(" "), lastName };
}

export async function importPresentationsFromCSV(
  eventId: string,
  rows: Record<string, string>[],
  mapping: ColumnMapping
): Promise<{ created: number; errors: Array<{ row: number; message: string }> }> {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const errors: Array<{ row: number; message: string }> = [];
  let created = 0;

  // Pre-fetch all existing contacts matching emails in this import
  const emailHeaders = Object.entries(mapping)
    .filter(([, dest]) => dest === "contact.email")
    .map(([h]) => h);
  const uniqueEmails = Array.from(
    new Set(rows.flatMap((r) => emailHeaders.map((h) => (r[h] ?? "").trim()).filter(Boolean)))
  );
  const existingContacts = uniqueEmails.length
    ? await prisma.contact.findMany({ where: { email: { in: uniqueEmails } } })
    : [];
  const contactByEmail = new Map(existingContacts.map((c) => [c.email as string, c]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const fields: Record<ImportDestination, string> = {} as Record<ImportDestination, string>;
      const internalNotesEntries: string[] = [];
      for (const [header, dest] of Object.entries(mapping)) {
        if (dest === "skip") continue;
        const val = (row[header] ?? "").trim();
        if (dest === "presentation.internalNotes") {
          if (val) internalNotesEntries.push(`${header}: ${val}`);
        } else {
          fields[dest] = val;
        }
      }
      if (internalNotesEntries.length) {
        fields["presentation.internalNotes"] = internalNotesEntries.join("\n");
      }

      const title = fields["presentation.title"]?.trim();
      if (!title) {
        errors.push({ row: i + 1, message: "Missing title — row skipped" });
        continue;
      }

      let contactId: string | null = null;
      const email = fields["contact.email"]?.trim() || null;
      let firstName = fields["contact.firstName"]?.trim() || "";
      let lastName = fields["contact.lastName"]?.trim() || "";
      if (fields["contact.fullName"]?.trim()) {
        const split = splitFullName(fields["contact.fullName"]);
        if (!firstName) firstName = split.firstName;
        if (!lastName) lastName = split.lastName;
      }

      if (firstName || lastName || email) {
        let contact = email ? (contactByEmail.get(email) ?? null) : null;
        if (!contact) {
          contact = await prisma.contact.create({
            data: { firstName: firstName || "Unknown", lastName, email, updatedById: session.user.id },
          });
          if (email) contactByEmail.set(email, contact);
        }
        contactId = contact.id;
      }

      const instanceCountRaw = fields["presentation.instanceCount"]?.trim();
      const instanceCount = instanceCountRaw ? parseInt(instanceCountRaw) : 1;

      const presentation = await prisma.presentation.create({
        data: {
          eventId,
          title,
          description: fields["presentation.description"]?.trim() || null,
          schedulingNotes: fields["presentation.schedulingNotes"]?.trim() || null,
          internalNotes: fields["presentation.internalNotes"]?.trim() || null,
          instanceCount,
          updatedById: session.user.id,
        },
      });

      if (contactId) {
        await prisma.presentationContact.create({
          data: { presentationId: presentation.id, contactId, isPrimary: true, sortOrder: 0 },
        });
      }

      await autoAssignDefaultWorkflows("presentation", presentation.id, eventId);
      created++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  revalidatePath(`/events/${eventId}/presentations`);
  return { created, errors };
}

export async function getPresentationOptions(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return prisma.presentation.findMany({
    where: { eventId },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}
