"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ============================================================================
// Track CRUD (event-scoped)
// ============================================================================

export async function getTracks(eventId: string) {
  return prisma.presentationTrack.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createTrack(eventId: string, formData: FormData) {
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
  await prisma.presentationTrack.delete({ where: { id: trackId } });
  revalidatePath(`/events/${eventId}/presentations`);
}

// ============================================================================
// Presentation CRUD
// ============================================================================

export async function getPresentations(eventId: string) {
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
  return prisma.presentation.findUnique({
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
      avOrder: true,
      event: true,
    },
  });
}

export async function createPresentation(eventId: string, formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const trackId = formData.get("trackId") as string;
  const notes = formData.get("notes") as string;

  // Get speaker data from form
  const speakerContactIds = formData.getAll("speakerContactIds") as string[];
  const speakerRoles = formData.getAll("speakerRoles") as string[];
  const primarySpeakerId = formData.get("primarySpeakerId") as string;

  const type = formData.get("type") as string;
  const breakoutGroupId = formData.get("breakoutGroupId") as string;
  const instanceCountRaw = formData.get("instanceCount") as string;

  const presentation = await prisma.presentation.create({
    data: {
      title,
      type: type || "",
      description: description || null,
      trackId: trackId || null,
      notes: notes || null,
      breakoutGroupId: breakoutGroupId || null,
      instanceCount: instanceCountRaw ? parseInt(instanceCountRaw) || 1 : 1,
      eventId,
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

  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${presentation.id}`);
}

export async function updatePresentation(id: string, eventId: string, formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const trackId = formData.get("trackId") as string;
  const notes = formData.get("notes") as string;

  const type = formData.get("type") as string;
  const breakoutGroupId = formData.get("breakoutGroupId") as string;
  const instanceCountRaw = formData.get("instanceCount") as string;

  await prisma.presentation.update({
    where: { id },
    data: {
      title,
      type: type || "",
      description: description || null,
      trackId: trackId || null,
      notes: notes || null,
      breakoutGroupId: breakoutGroupId || null,
      ...(instanceCountRaw ? { instanceCount: parseInt(instanceCountRaw) || 1 } : {}),
    },
  });

  revalidatePath(`/events/${eventId}/presentations`);
  revalidatePath(`/events/${eventId}/presentations/${id}`);
  redirect(`/events/${eventId}/presentations/${id}?success=Presentation updated`);
}

export async function deletePresentation(id: string, eventId: string) {
  await prisma.presentation.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations`);
}

export async function duplicatePresentation(id: string, eventId: string) {
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
      notes: original.notes,
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
  await prisma.presentationContact.delete({ where: { id: speakerId } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function createAndAddPresentationSpeaker(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
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

export async function searchContacts(query: string) {
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
