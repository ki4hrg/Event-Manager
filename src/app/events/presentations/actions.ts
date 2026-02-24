"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
      function: {
        include: {
          rooms: { include: { room: true } },
          schedules: { orderBy: { startTime: "asc" } },
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
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      function: {
        include: {
          rooms: { include: { room: true } },
          schedules: { orderBy: { startTime: "asc" } },
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

  const presentation = await prisma.presentation.create({
    data: {
      title,
      description: description || null,
      trackId: trackId || null,
      notes: notes || null,
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

  await prisma.presentation.update({
    where: { id },
    data: {
      title,
      description: description || null,
      trackId: trackId || null,
      notes: notes || null,
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
// Function Linking
// ============================================================================

/**
 * Create a Function for a presentation and link it.
 * The Function is created with type=BREAKOUT and the presentation's title as name.
 */
export async function createFunctionForPresentation(
  presentationId: string,
  eventId: string
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { title: true, functionId: true },
  });

  if (!presentation) {
    throw new Error("Presentation not found");
  }

  if (presentation.functionId) {
    throw new Error("Presentation already has a linked function");
  }

  // Create the function with BREAKOUT type
  const fn = await prisma.function.create({
    data: {
      name: presentation.title,
      type: "BREAKOUT",
      eventId,
    },
  });

  // Link the presentation to the function
  await prisma.presentation.update({
    where: { id: presentationId },
    data: { functionId: fn.id },
  });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  return fn;
}

/**
 * Link a presentation to an existing function.
 */
export async function linkToFunction(
  presentationId: string,
  functionId: string,
  eventId: string
) {
  // Verify the function exists and belongs to the same event
  const fn = await prisma.function.findUnique({
    where: { id: functionId },
    select: { eventId: true, presentation: true },
  });

  if (!fn) {
    throw new Error("Function not found");
  }

  if (fn.eventId !== eventId) {
    throw new Error("Function belongs to a different event");
  }

  if (fn.presentation) {
    throw new Error("Function is already linked to another presentation");
  }

  await prisma.presentation.update({
    where: { id: presentationId },
    data: { functionId },
  });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

/**
 * Unlink a presentation from its function.
 * Optionally delete the function if it was created specifically for this presentation.
 */
export async function unlinkFunction(
  presentationId: string,
  eventId: string,
  deleteFunction: boolean = false
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { functionId: true },
  });

  if (!presentation?.functionId) {
    return;
  }

  const functionId = presentation.functionId;

  // Unlink first
  await prisma.presentation.update({
    where: { id: presentationId },
    data: { functionId: null },
  });

  // Optionally delete the function
  if (deleteFunction) {
    await prisma.function.delete({ where: { id: functionId } });
  }

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// ============================================================================
// Schedule Management (via linked Function)
// ============================================================================

export async function addScheduleToPresentation(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { functionId: true },
  });

  if (!presentation?.functionId) {
    throw new Error("Presentation is not linked to a function");
  }

  const type = formData.get("type") as string || "SESSION";
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const roomIds = formData.getAll("roomIds") as string[];

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  const parsedStartTime = parseDateTimeInTimezone(startTime, timezone);
  const parsedEndTime = parseDateTimeInTimezone(endTime, timezone);

  // Get max sortOrder
  const maxOrder = await prisma.functionSchedule.findFirst({
    where: { functionId: presentation.functionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.functionSchedule.create({
    data: {
      functionId: presentation.functionId,
      type,
      startTime: parsedStartTime,
      endTime: parsedEndTime,
      notes: notes || null,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  // Update room assignments on the function
  if (roomIds.length > 0) {
    // Get existing room IDs
    const existingRooms = await prisma.functionRoom.findMany({
      where: { functionId: presentation.functionId },
      select: { roomId: true },
    });
    const existingRoomIds = new Set(existingRooms.map((r) => r.roomId));

    // Add any new rooms
    const newRoomIds = roomIds.filter((id) => !existingRoomIds.has(id));
    if (newRoomIds.length > 0) {
      await prisma.functionRoom.createMany({
        data: newRoomIds.map((roomId) => ({
          functionId: presentation.functionId!,
          roomId,
        })),
      });
    }
  }

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updatePresentationSchedule(
  scheduleId: string,
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const type = formData.get("type") as string || "SESSION";
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  await prisma.functionSchedule.update({
    where: { id: scheduleId },
    data: {
      type,
      startTime: parseDateTimeInTimezone(startTime, timezone),
      endTime: parseDateTimeInTimezone(endTime, timezone),
      notes: notes || null,
    },
  });

  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function deletePresentationSchedule(
  scheduleId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.functionSchedule.delete({ where: { id: scheduleId } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updatePresentationRooms(
  presentationId: string,
  eventId: string,
  roomIds: string[]
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { functionId: true },
  });

  if (!presentation?.functionId) {
    throw new Error("Presentation is not linked to a function");
  }

  // Replace all room assignments
  await prisma.functionRoom.deleteMany({
    where: { functionId: presentation.functionId },
  });

  if (roomIds.length > 0) {
    await prisma.functionRoom.createMany({
      data: roomIds.map((roomId) => ({
        functionId: presentation.functionId!,
        roomId,
      })),
    });
  }

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
// Get Available Functions (for linking UI)
// ============================================================================

export async function getAvailableFunctions(eventId: string) {
  return prisma.function.findMany({
    where: {
      eventId,
      presentation: null, // Only functions not linked to a presentation
    },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
    },
    orderBy: { name: "asc" },
  });
}
