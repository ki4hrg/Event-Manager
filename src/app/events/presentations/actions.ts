"use server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

// ============================================================================
// Track CRUD (event-scoped)
// ============================================================================

export async function getTracks(eventId: string) {
  await requireAuth();
  return prisma.presentationTrack.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createTrack(eventId: string, formData: FormData) {
  await requireAuth();
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
  await requireAuth();
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;

  await prisma.presentationTrack.update({
    where: { id: trackId },
    data: {
      name,
      color: color || null,
    },
  });

  revalidatePath(`/events/${eventId}/presentations`);
}

export async function deleteTrack(trackId: string, eventId: string) {
  await requireAuth();
  await prisma.presentationTrack.delete({ where: { id: trackId } });
  revalidatePath(`/events/${eventId}/presentations`);
}

// ============================================================================
// Presentation CRUD
// ============================================================================

export async function getPresentations(eventId: string) {
  await requireAuth();
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
  await requireAuth();
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
        },
      },
      avOrderLinks: { include: { avOrder: { select: { id: true, name: true } } } },
      setupOrderLinks: { include: { setupOrder: { select: { id: true, name: true, setupType: true, room: { select: { name: true } } } } } },
      mediaOrderLinks: { include: { mediaOrder: { select: { id: true, name: true } } } },
      printOrder: { select: { id: true, name: true } },
      event: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    avOrders: row.avOrderLinks.map((l) => l.avOrder),
    setupOrders: row.setupOrderLinks.map((l) => l.setupOrder),
    mediaOrders: row.mediaOrderLinks.map((l) => l.mediaOrder),
  };
}

export async function createPresentation(eventId: string, formData: FormData) {
  await requireAuth();
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

  await autoAssignDefaultWorkflows("presentation", presentation.id);
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${presentation.id}`);
}

export async function updatePresentationInstanceCount(id: string, eventId: string, count: number) {
  await requireAuth();
  await prisma.presentation.update({
    where: { id },
    data: { instanceCount: count },
  });
  revalidatePath(`/events/${eventId}/presentations/${id}`);
}

export async function updatePresentation(id: string, eventId: string, formData: FormData) {
  await requireAuth();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const trackId = formData.get("trackId") as string;
  const schedulingNotes = formData.get("schedulingNotes") as string;
  const internalNotes = formData.get("internalNotes") as string;

  const type = formData.get("type") as string;
  const breakoutGroupId = formData.get("breakoutGroupId");
  const instanceCountRaw = formData.get("instanceCount") as string;

  await prisma.presentation.update({
    where: { id },
    data: {
      title,
      type: type || "",
      description: description || null,
      trackId: trackId || null,
      schedulingNotes: schedulingNotes || null,
      internalNotes: internalNotes || null,
      ...(breakoutGroupId !== null ? { breakoutGroupId: (breakoutGroupId as string) || null } : {}),
      ...(instanceCountRaw ? { instanceCount: parseInt(instanceCountRaw) } : {}),
    },
  });

  revalidatePath(`/events/${eventId}/presentations`);
  revalidatePath(`/events/${eventId}/presentations/${id}`);
  redirect(`/events/${eventId}/presentations/${id}?success=Presentation updated`);
}

export async function deletePresentation(id: string, eventId: string) {
  await requireAuth();
  await prisma.presentation.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations`);
}

export async function deletePresentations(ids: string[], eventId: string) {
  await requireAuth();
  await prisma.presentation.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function bulkUpdatePresentations(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; trackId?: string | null; type?: string }
) {
  await requireAuth();
  const { status, substatus, trackId, type } = updates;
  await prisma.presentation.updateMany({
    where: { id: { in: ids }, eventId },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(substatus !== undefined ? { substatus } : {}),
      ...(trackId !== undefined ? { trackId } : {}),
      ...(type !== undefined ? { type } : {}),
    },
  });
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function duplicatePresentation(id: string, eventId: string) {
  await requireAuth();
  const original = await prisma.presentation.findUnique({
    where: { id },
    include: {
      speakers: true,
    },
  });

  if (!original) {
    throw new Error("Presentation not found");
  }

  const duplicate = await prisma.presentation.create({
    data: {
      title: `${original.title} (Copy)`,
      type: original.type,
      description: original.description,
      trackId: original.trackId,
      schedulingNotes: original.schedulingNotes,
      internalNotes: original.internalNotes,
      eventId: original.eventId,
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
  await requireAuth();
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

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updateSpeaker(
  speakerId: string,
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  await requireAuth();
  const role = formData.get("role") as string;
  const isPrimary = formData.get("isPrimary") === "true";

  if (isPrimary) {
    await prisma.presentationContact.updateMany({
      where: { presentationId, id: { not: speakerId } },
      data: { isPrimary: false },
    });
  }

  await prisma.presentationContact.update({
    where: { id: speakerId },
    data: {
      role: role || null,
      isPrimary,
    },
  });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function removeSpeaker(speakerId: string, presentationId: string, eventId: string) {
  await requireAuth();
  await prisma.presentationContact.delete({ where: { id: speakerId } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function createAndAddPresentationSpeaker(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  await requireAuth();
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

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function reorderSpeakers(
  presentationId: string,
  eventId: string,
  orderedIds: string[]
) {
  await requireAuth();
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.presentationContact.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// ============================================================================
// Contact Search (for speaker selection)
// ============================================================================

// ============================================================================
// Contact Search (for speaker selection)
// ============================================================================

export async function searchContacts(query: string) {
  await requireAuth();
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
  await requireAuth();
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
            data: { firstName: firstName || "Unknown", lastName, email },
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
        },
      });

      if (contactId) {
        await prisma.presentationContact.create({
          data: { presentationId: presentation.id, contactId, isPrimary: true, sortOrder: 0 },
        });
      }

      await autoAssignDefaultWorkflows("presentation", presentation.id);
      created++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  revalidatePath(`/events/${eventId}/presentations`);
  return { created, errors };
}

export async function getPresentationOptions(eventId: string) {
  await requireAuth();
  return prisma.presentation.findMany({
    where: { eventId },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}
