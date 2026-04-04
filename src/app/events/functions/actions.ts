"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Parse a datetime-local input value (YYYY-MM-DDTHH:MM) as if it's in the given timezone
 * and return a UTC Date object.
 */
function parseDateTimeInTimezone(dateTimeLocal: string, timezone: string): Date {
  // Parse the input components
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Start with a guess - treat the input as UTC
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Formatter to check what our guess looks like in the target timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Iterate to converge (handles DST edge cases)
  for (let i = 0; i < 3; i++) {
    const formatted = formatter.format(guess);
    // formatted is like "2024-03-15, 03:00" - parse it
    const parts = formatted.replace(/, /, "T").split(/[-T:]/);
    const guessYear = parseInt(parts[0]);
    const guessMonth = parseInt(parts[1]);
    const guessDay = parseInt(parts[2]);
    const guessHour = parseInt(parts[3]);
    const guessMinute = parseInt(parts[4]);

    // Calculate difference between what we want and what we got
    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    const guessLocalMs = Date.UTC(guessYear, guessMonth - 1, guessDay, guessHour, guessMinute);
    const diffMs = targetMs - guessLocalMs;

    if (diffMs === 0) break;

    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

export async function getFunctions(eventId: string) {
  return prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getFunctionsWithPresentations(eventId: string) {
  return prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: { include: { rooms: { include: { room: true } } } },
      presentationSlots: { include: { presentation: true } },
      sessionRoomOverrides: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getFunction(id: string) {
  return prisma.function.findUnique({
    where: { id },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { sortOrder: "asc" } },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      avOrder: true,
      beo: true,
      setupOrder: true,
      breakoutGroup: true,
    },
  });
}

export async function createFunction(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as string;
  const setupNotes = formData.get("setupNotes") as string;
  const roomIds = formData.getAll("roomIds") as string[];
  const breakoutGroupId = formData.get("breakoutGroupId") as string;
  const startTimeRaw = formData.get("startTime") as string;
  const endTimeRaw = formData.get("endTime") as string;

  // Create the function
  const fn = await prisma.function.create({
    data: {
      name,
      description: description || null,
      type: type || "",
      setupNotes: setupNotes || null,
      eventId,
      breakoutGroupId: breakoutGroupId || null,
      rooms: {
        create: roomIds.map((roomId) => ({ roomId })),
      },
    },
  });

  // If start/end times provided (e.g. from breakout block creation), create a schedule
  if (startTimeRaw && endTimeRaw) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { timezone: true },
    });
    const timezone = event?.timezone || "America/Chicago";
    await prisma.functionSchedule.create({
      data: {
        functionId: fn.id,
        type: "SESSION",
        startTime: parseDateTimeInTimezone(startTimeRaw, timezone),
        endTime: parseDateTimeInTimezone(endTimeRaw, timezone),
        sortOrder: 0,
      },
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/breakout-schedule`);

  if (type === "BREAKOUT_BLOCK") {
    redirect(`/events/${eventId}/breakout-schedule`);
  }
  redirect(`/events/${eventId}/functions/${fn.id}`);
}

export async function updateFunction(id: string, eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as string;
  const setupNotes = formData.get("setupNotes") as string;
  const roomIds = formData.getAll("roomIds") as string[];
  const breakoutGroupId = formData.get("breakoutGroupId") as string;

  // Update the function
  await prisma.function.update({
    where: { id },
    data: {
      name,
      description: description || null,
      type: type || "",
      setupNotes: setupNotes || null,
      breakoutGroupId: breakoutGroupId || null,
    },
  });

  // Update room assignments - delete existing and recreate
  await prisma.functionRoom.deleteMany({ where: { functionId: id } });
  if (roomIds.length > 0) {
    await prisma.functionRoom.createMany({
      data: roomIds.map((roomId) => ({ functionId: id, roomId })),
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/functions/${id}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}/functions/${id}?success=Function updated`);
}

export async function deleteFunction(id: string, eventId: string) {
  await prisma.function.delete({ where: { id } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}`);
}

export async function duplicateFunction(id: string, eventId: string) {
  const original = await prisma.function.findUnique({
    where: { id },
    include: {
      rooms: true,
      schedules: true,
    },
  });

  if (!original) {
    throw new Error("Function not found");
  }

  // Create duplicate
  const duplicate = await prisma.function.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      setupNotes: original.setupNotes,
      eventId: original.eventId,
      rooms: {
        create: original.rooms.map((r) => ({ roomId: r.roomId })),
      },
    },
  });

  // Copy schedules
  if (original.schedules.length > 0) {
    await prisma.functionSchedule.createMany({
      data: original.schedules.map((s) => ({
        functionId: duplicate.id,
        type: s.type,
        startTime: s.startTime,
        endTime: s.endTime,
        notes: s.notes,
        isPublic: s.isPublic,
        sortOrder: s.sortOrder,
      })),
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}/functions/${duplicate.id}`);
}

// Schedule item actions
export async function createSchedule(functionId: string, eventId: string, formData: FormData) {
  const type = formData.get("type") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const isPublic = formData.get("isPublic") === "true";

  // Get event timezone
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  // Get max sortOrder
  const maxOrder = await prisma.functionSchedule.findFirst({
    where: { functionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.functionSchedule.create({
    data: {
      functionId,
      type,
      startTime: parseDateTimeInTimezone(startTime, timezone),
      endTime: parseDateTimeInTimezone(endTime, timezone),
      notes: notes || null,
      isPublic,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function updateSchedule(scheduleId: string, functionId: string, eventId: string, formData: FormData) {
  const type = formData.get("type") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const isPublic = formData.get("isPublic") === "true";

  // Get event timezone
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
      isPublic,
    },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function deleteSchedule(scheduleId: string, functionId: string, eventId: string) {
  await prisma.functionSchedule.delete({ where: { id: scheduleId } });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// ============================================================================
// Contact Assignment
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

export async function addFunctionContact(functionId: string, eventId: string, formData: FormData) {
  const contactId = formData.get("contactId") as string;
  const role = formData.get("role") as string;

  await prisma.functionContact.create({
    data: {
      functionId,
      contactId,
      role: role || null,
    },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function updateFunctionContact(
  contactId: string,
  functionId: string,
  eventId: string,
  formData: FormData
) {
  const role = formData.get("role") as string;

  await prisma.functionContact.update({
    where: { id: contactId },
    data: { role: role || null },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function removeFunctionContact(contactId: string, functionId: string, eventId: string) {
  await prisma.functionContact.delete({ where: { id: contactId } });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// ============================================================================
// Agenda DnD Actions
// ============================================================================

export async function updateFunctionRoom(
  functionId: string,
  oldRoomId: string,
  newRoomId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  if (oldRoomId === newRoomId) return { success: true };

  const existing = await prisma.functionRoom.findUnique({
    where: { functionId_roomId: { functionId, roomId: newRoomId } },
  });
  if (existing) return { success: false, error: "Room already assigned to this function" };

  await prisma.$transaction([
    prisma.functionRoom.delete({
      where: { functionId_roomId: { functionId, roomId: oldRoomId } },
    }),
    prisma.functionRoom.create({
      data: { functionId, roomId: newRoomId },
    }),
  ]);

  revalidatePath(`/events/${eventId}/agenda`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
  return { success: true };
}

export async function scheduleUnscheduledFunction(
  functionId: string,
  roomId: string,
  startTime: string,
  endTime: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) return { success: false, error: "End time must be after start time" };

  // Assign room if not already assigned
  const existingRoom = await prisma.functionRoom.findUnique({
    where: { functionId_roomId: { functionId, roomId } },
  });
  if (!existingRoom) {
    await prisma.functionRoom.create({ data: { functionId, roomId } });
  }

  // Create schedule entry
  await prisma.functionSchedule.create({
    data: {
      functionId,
      type: "MAIN",
      startTime: start,
      endTime: end,
      sortOrder: 0,
    },
  });

  revalidatePath(`/events/${eventId}/agenda`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
  return { success: true };
}

export async function rescheduleEntry(
  scheduleId: string,
  functionId: string,
  newStartTime: string,
  newEndTime: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = new Date(newStartTime);
  const endTime = new Date(newEndTime);

  if (endTime <= startTime) return { success: false, error: "End time must be after start time" };

  await prisma.functionSchedule.update({
    where: { id: scheduleId },
    data: { startTime, endTime },
  });

  revalidatePath(`/events/${eventId}/agenda`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
  return { success: true };
}
