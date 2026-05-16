"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { EntityStatus } from "@prisma/client";

// Verifies the function belongs to the claimed event before a create-style mutation
// (where Prisma can't enforce ownership via the where clause).
async function assertFunctionInEvent(functionId: string, eventId: string) {
  const found = await prisma.function.findUnique({
    where: { id: functionId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}
import { checkRoomConflicts, type RoomConflict } from "@/lib/conflicts";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";

export async function getFunctions(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
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

export async function getFunctionsForTable(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  const rows = await prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: true,
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      avOrderFunctions: { include: { avOrder: true } },
      cateringOrder: true,
      setupOrderFunctions: { include: { setupOrder: { include: { room: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    avOrders: r.avOrderFunctions.map((l) => l.avOrder),
    setupOrders: r.setupOrderFunctions.map((l) => l.setupOrder),
  }));
}

export type FunctionForTable = Awaited<ReturnType<typeof getFunctionsForTable>>[number];

export async function getFunctionsWithPresentations(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
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
  const row = await prisma.function.findUnique({
    where: { id },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { sortOrder: "asc" } },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      avOrderFunctions: { include: { avOrder: true } },
      cateringOrder: true,
      setupOrderFunctions: { include: { setupOrder: { include: { room: true } } } },
      printOrderFunctions: { include: { printOrder: { select: { id: true, name: true } } } },
      mediaOrderFunctions: { include: { mediaOrder: { select: { id: true, name: true } } } },
      breakoutGroup: true,
    },
  });
  if (!row) return null;
  await requirePermission("FUNCTIONS", "VIEW", row.eventId);
  return {
    ...row,
    avOrders: row.avOrderFunctions.map((l) => l.avOrder),
    setupOrders: row.setupOrderFunctions.map((l) => l.setupOrder),
  };
}

export async function createFunction(eventId: string, formData: FormData) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as string;
  const notes = formData.get("notes") as string;
  const offSiteLocation = (formData.get("offSiteLocation") as string)?.trim() || null;
  const roomIds = formData.getAll("roomIds") as string[];
  const breakoutGroupId = formData.get("breakoutGroupId") as string;
  const startTimeRaw = formData.get("startTime") as string;
  const endTimeRaw = formData.get("endTime") as string;

  const defaults = await resolveCreateStatus(eventId, "FUNCTION");

  // Create the function
  const fn = await prisma.function.create({
    data: {
      name,
      description: description || null,
      type: type || "",
      notes: notes || null,
      offSiteLocation,
      eventId,
      breakoutGroupId: breakoutGroupId || null,
      status: defaults.status,
      substatus: defaults.substatus,
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

  await autoAssignDefaultWorkflows("function", fn.id, eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/breakout-schedule`);

  if (type === "BREAKOUT_BLOCK") {
    redirect(`/events/${eventId}/breakout-schedule`);
  }
  redirect(`/events/${eventId}/functions/${fn.id}`);
}

export async function updateFunction(id: string, eventId: string, formData: FormData) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as string;
  const notes = formData.get("notes") as string;
  const offSiteLocation = (formData.get("offSiteLocation") as string)?.trim() || null;
  const roomIds = formData.getAll("roomIds") as string[];
  const breakoutGroupId = formData.get("breakoutGroupId") as string;

  // eventId in the where clause atomically verifies the function belongs to
  // the claimed event — guards against a caller passing another event's id.
  await prisma.function.update({
    where: { id, eventId },
    data: {
      name,
      description: description || null,
      type: type || "",
      notes: notes || null,
      offSiteLocation,
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
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.function.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}`);
}

export async function deleteFunctions(ids: string[], eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.function.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/functions`);
  revalidatePath(`/events/${eventId}/agenda`);
}

export async function getFunctionOptions(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.function.findMany({
    where: { eventId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function bulkUpdateFunctions(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; type?: string }
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await prisma.function.updateMany({ where: { id: { in: ids }, eventId }, data: updates });
  revalidatePath(`/events/${eventId}/functions`);
}

export async function duplicateFunction(id: string, eventId: string) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const original = await prisma.function.findUnique({
    where: { id, eventId },
    include: {
      rooms: true,
      schedules: true,
    },
  });

  if (!original) notFound();

  // Create duplicate
  const duplicate = await prisma.function.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      notes: original.notes,
      offSiteLocation: original.offSiteLocation,
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

async function getFunctionRoomIds(functionId: string): Promise<string[]> {
  const rooms = await prisma.functionRoom.findMany({ where: { functionId }, select: { roomId: true } });
  return rooms.map((r) => r.roomId);
}

// Schedule item actions
export async function createSchedule(
  functionId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | undefined> {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  const type = formData.get("type") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const isPublic = formData.get("isPublic") === "true";
  const force = formData.get("force") === "true";

  const [event, roomIds] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } }),
    force ? Promise.resolve([]) : getFunctionRoomIds(functionId),
  ]);
  const timezone = event?.timezone || "America/Chicago";

  const parsedStart = parseDateTimeInTimezone(startTime, timezone);
  const parsedEnd = parseDateTimeInTimezone(endTime, timezone);

  if (!force && roomIds.length > 0) {
    const conflicts = await checkRoomConflicts(roomIds, parsedStart, parsedEnd, functionId);
    if (conflicts.length > 0) return { conflicts };
  }

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
      startTime: parsedStart,
      endTime: parsedEnd,
      notes: notes || null,
      isPublic,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function updateSchedule(
  scheduleId: string,
  functionId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | undefined> {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  const type = formData.get("type") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;
  const isPublic = formData.get("isPublic") === "true";
  const force = formData.get("force") === "true";

  const [event, roomIds] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } }),
    force ? Promise.resolve([]) : getFunctionRoomIds(functionId),
  ]);
  const timezone = event?.timezone || "America/Chicago";

  const parsedStart = parseDateTimeInTimezone(startTime, timezone);
  const parsedEnd = parseDateTimeInTimezone(endTime, timezone);

  if (!force && roomIds.length > 0) {
    const conflicts = await checkRoomConflicts(roomIds, parsedStart, parsedEnd, functionId);
    if (conflicts.length > 0) return { conflicts };
  }

  await prisma.functionSchedule.update({
    where: { id: scheduleId, function: { eventId } },
    data: {
      type,
      startTime: parsedStart,
      endTime: parsedEnd,
      notes: notes || null,
      isPublic,
    },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function deleteSchedule(scheduleId: string, functionId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.functionSchedule.delete({ where: { id: scheduleId, function: { eventId } } });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// ============================================================================
// Contact Assignment
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

export async function addFunctionContact(functionId: string, eventId: string, formData: FormData) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
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
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const role = formData.get("role") as string;

  await prisma.functionContact.update({
    where: { id: contactId, function: { eventId } },
    data: { role: role || null },
  });

  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function removeFunctionContact(contactId: string, functionId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await prisma.functionContact.delete({ where: { id: contactId, function: { eventId } } });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function createAndAddFunctionContact(
  functionId: string,
  eventId: string,
  formData: FormData
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const organization = formData.get("organization") as string;
  const role = formData.get("role") as string;

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      organization: organization || null,
    },
  });

  await prisma.functionContact.create({
    data: { functionId, contactId: contact.id, role: role || null },
  });

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
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
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
  eventId: string,
  force = false
): Promise<{ success: boolean; error?: string; conflicts?: RoomConflict[] }> {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) return { success: false, error: "End time must be after start time" };

  // Check for room conflicts unless forced
  if (!force) {
    const conflicts = await checkRoomConflicts([roomId], start, end, functionId);
    if (conflicts.length > 0) return { success: false, conflicts };
  }

  await prisma.functionRoom.upsert({
    where: { functionId_roomId: { functionId, roomId } },
    create: { functionId, roomId },
    update: {},
  });

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
  eventId: string,
  force = false
): Promise<{ success: boolean; error?: string; conflicts?: RoomConflict[] }> {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  const startTime = new Date(newStartTime);
  const endTime = new Date(newEndTime);

  if (endTime <= startTime) return { success: false, error: "End time must be after start time" };

  if (!force) {
    const roomIds = await getFunctionRoomIds(functionId);
    if (roomIds.length > 0) {
      const conflicts = await checkRoomConflicts(roomIds, startTime, endTime, functionId);
      if (conflicts.length > 0) return { success: false, conflicts };
    }
  }

  await prisma.functionSchedule.update({
    where: { id: scheduleId, function: { eventId } },
    data: { startTime, endTime },
  });

  revalidatePath(`/events/${eventId}/agenda`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
  return { success: true };
}
