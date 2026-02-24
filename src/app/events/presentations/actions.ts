"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkRoomConflicts, type RoomConflict } from "@/lib/conflicts";

/**
 * Parse a datetime-local input value (YYYY-MM-DDTHH:MM) as if it's in the given timezone
 * and return a UTC Date object.
 */
function parseDateTimeInTimezone(dateTimeLocal: string, timezone: string): Date {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  for (let i = 0; i < 3; i++) {
    const formatted = formatter.format(guess);
    const parts = formatted.replace(/, /, "T").split(/[-T:]/);
    const guessYear = parseInt(parts[0]);
    const guessMonth = parseInt(parts[1]);
    const guessDay = parseInt(parts[2]);
    const guessHour = parseInt(parts[3]);
    const guessMinute = parseInt(parts[4]);

    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    const guessLocalMs = Date.UTC(guessYear, guessMonth - 1, guessDay, guessHour, guessMinute);
    const diffMs = targetMs - guessLocalMs;

    if (diffMs === 0) break;

    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

// ============================================================================
// Presentation CRUD
// ============================================================================

export async function getPresentations(eventId: string) {
  return prisma.presentation.findMany({
    where: { eventId },
    include: {
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      sessions: {
        include: { rooms: { include: { room: true } } },
        orderBy: { startTime: "asc" },
      },
      avNeeds: true,
    },
    orderBy: [{ track: "asc" }, { title: "asc" }],
  });
}

export async function getPresentation(id: string) {
  return prisma.presentation.findUnique({
    where: { id },
    include: {
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      sessions: {
        include: { rooms: { include: { room: true } } },
        orderBy: { startTime: "asc" },
      },
      avNeeds: true,
      event: true,
    },
  });
}

export async function createPresentation(eventId: string, formData: FormData) {
  const title = formData.get("title") as string;
  const abstract = formData.get("abstract") as string;
  const duration = formData.get("duration") as string;
  const track = formData.get("track") as string;
  const level = formData.get("level") as string;
  const notes = formData.get("notes") as string;

  const presentation = await prisma.presentation.create({
    data: {
      title,
      abstract: abstract || null,
      duration: duration ? parseInt(duration) : null,
      track: track || null,
      level: level || null,
      notes: notes || null,
      eventId,
    },
  });

  // Handle AV needs
  const equipment = formData.getAll("equipment") as string[];
  const avNotes = formData.get("av_notes") as string;

  if (equipment.length > 0 || avNotes) {
    await prisma.presentationAVNeeds.create({
      data: {
        presentationId: presentation.id,
        equipment,
        notes: avNotes || null,
      },
    });
  }

  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${presentation.id}`);
}

export async function updatePresentation(id: string, eventId: string, formData: FormData) {
  const title = formData.get("title") as string;
  const abstract = formData.get("abstract") as string;
  const duration = formData.get("duration") as string;
  const track = formData.get("track") as string;
  const level = formData.get("level") as string;
  const notes = formData.get("notes") as string;

  await prisma.presentation.update({
    where: { id },
    data: {
      title,
      abstract: abstract || null,
      duration: duration ? parseInt(duration) : null,
      track: track || null,
      level: level || null,
      notes: notes || null,
    },
  });

  // Handle AV needs
  const equipment = formData.getAll("equipment") as string[];
  const avNotes = formData.get("av_notes") as string;

  await prisma.presentationAVNeeds.deleteMany({ where: { presentationId: id } });
  if (equipment.length > 0 || avNotes) {
    await prisma.presentationAVNeeds.create({
      data: {
        presentationId: id,
        equipment,
        notes: avNotes || null,
      },
    });
  }

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
      avNeeds: true,
    },
  });

  if (!original) {
    throw new Error("Presentation not found");
  }

  const duplicate = await prisma.presentation.create({
    data: {
      title: `${original.title} (Copy)`,
      abstract: original.abstract,
      duration: original.duration,
      track: original.track,
      level: original.level,
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

  // Copy AV needs
  if (original.avNeeds) {
    await prisma.presentationAVNeeds.create({
      data: {
        presentationId: duplicate.id,
        equipment: original.avNeeds.equipment,
        notes: original.avNeeds.notes,
      },
    });
  }

  // Note: We don't copy sessions since they are scheduled instances

  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${duplicate.id}`);
}

// ============================================================================
// Session CRUD
// ============================================================================

export async function createSession(
  presentationId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | void> {
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const roomIds = formData.getAll("roomIds") as string[];

  // Get event timezone
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  const parsedStartTime = parseDateTimeInTimezone(startTime, timezone);
  const parsedEndTime = parseDateTimeInTimezone(endTime, timezone);

  // Check for conflicts
  const conflicts = await checkRoomConflicts(roomIds, parsedStartTime, parsedEndTime);

  // If there are conflicts, we still create but return the conflicts for warning display
  const session = await prisma.presentationSession.create({
    data: {
      presentationId,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      notes: notes || null,
      rooms: {
        create: roomIds.map((roomId) => ({ roomId })),
      },
    },
  });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);

  if (conflicts.length > 0) {
    return { conflicts };
  }
}

export async function updateSession(
  sessionId: string,
  presentationId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | void> {
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const roomIds = formData.getAll("roomIds") as string[];

  // Get event timezone
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  const parsedStartTime = parseDateTimeInTimezone(startTime, timezone);
  const parsedEndTime = parseDateTimeInTimezone(endTime, timezone);

  // Check for conflicts (excluding current session)
  const conflicts = await checkRoomConflicts(
    roomIds,
    parsedStartTime,
    parsedEndTime,
    sessionId
  );

  // Update session
  await prisma.presentationSession.update({
    where: { id: sessionId },
    data: {
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      notes: notes || null,
    },
  });

  // Update room assignments
  await prisma.presentationSessionRoom.deleteMany({ where: { sessionId } });
  if (roomIds.length > 0) {
    await prisma.presentationSessionRoom.createMany({
      data: roomIds.map((roomId) => ({ sessionId, roomId })),
    });
  }

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);

  if (conflicts.length > 0) {
    return { conflicts };
  }
}

export async function deleteSession(sessionId: string, presentationId: string, eventId: string) {
  await prisma.presentationSession.delete({ where: { id: sessionId } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
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

  // Get max sortOrder
  const maxOrder = await prisma.presentationContact.findFirst({
    where: { presentationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  // If setting as primary, unset other primaries
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

  // If setting as primary, unset other primaries
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

// ============================================================================
// Check for Conflicts (for UI validation)
// ============================================================================

export async function checkConflicts(
  roomIds: string[],
  startTime: string,
  endTime: string,
  timezone: string,
  excludeSessionId?: string
): Promise<RoomConflict[]> {
  const parsedStartTime = parseDateTimeInTimezone(startTime, timezone);
  const parsedEndTime = parseDateTimeInTimezone(endTime, timezone);

  return checkRoomConflicts(roomIds, parsedStartTime, parsedEndTime, excludeSessionId);
}
