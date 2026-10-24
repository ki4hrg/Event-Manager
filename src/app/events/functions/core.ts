// Pure cores for function + function-schedule + function-contact + agenda
// mutations. NOT a "use server" file — see src/app/contacts/core.ts for the
// security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePermissionForUser,
  PermissionError, requireEventTenantId } from "@/lib/permissions";
import { checkRoomConflicts, type RoomConflict } from "@/lib/conflicts";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { rangeTouched } from "@/lib/dateRange";
import { defaultScheduleType } from "@/lib/scheduleTypes";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { assertEventRefs } from "@/lib/eventRefs";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";
import {
  renumberFunctions,
  retireFunctionNumbers,
  setFunctionNumbersLocked,
  syncFunctionNumbers,
  validateFunctionNumberOverride,
} from "@/lib/functionNumbering";

// Atomically confirms the function belongs to the claimed event. Throws
// PermissionError("NOT_FOUND") on miss; the MCP route maps this to a protocol
// error and the UI surfaces it as a notFound() / 500 (rare in practice — the
// UI never sends mismatched ids).
async function assertFunctionInEvent(functionId: string, eventId: string) {
  const found = await prisma.function.findUnique({
    where: { id: functionId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

async function getFunctionRoomIds(functionId: string): Promise<string[]> {
  const rooms = await prisma.functionRoom.findMany({
    where: { functionId },
    select: { roomId: true },
  });
  return rooms.map((r) => r.roomId);
}

// ---------------------------------------------------------------------------
// Function (top-level)

// ESG Part II / IIIa fields. All optional so existing callers (MCP, bulk
// paths) keep working; on update, an omitted key leaves the column alone.
// functionNumber: a string pins a manual override, null/"" clears the pin and
// lets src/lib/functionNumbering.ts assign.
export type FunctionEsgArgs = {
  functionNumber?: string | null;
  postToReaderBoard?: boolean | null;
  readerBoardText?: string | null;
  hold24Hour?: boolean;
  defaultSetup?: string | null; // setup_type label
  expectedAttendance?: number | null;
  setForCount?: number | null;
  actualAttendance?: number | null;
  decorNotes?: string | null;
  securityNotes?: string | null;
  signageNotes?: string | null;
  billingNotes?: string | null;
  costCenter?: string | null;
};

const ESG_SCALAR_KEYS = [
  "postToReaderBoard",
  "readerBoardText",
  "hold24Hour",
  "defaultSetup",
  "expectedAttendance",
  "setForCount",
  "actualAttendance",
  "decorNotes",
  "securityNotes",
  "signageNotes",
  "billingNotes",
  "costCenter",
] as const;

function esgData(args: FunctionEsgArgs) {
  const data: Record<string, unknown> = {};
  for (const key of ESG_SCALAR_KEYS) {
    if (args[key] !== undefined) data[key] = args[key];
  }
  return data;
}

async function functionNumberData(eventId: string, functionId: string | null, args: FunctionEsgArgs) {
  if (args.functionNumber === undefined) return {};
  const value = await validateFunctionNumberOverride(eventId, functionId, args.functionNumber);
  return value ? { functionNumber: value, functionNumberPinned: true } : { functionNumberPinned: false };
}

export type FunctionWriteArgs = FunctionEsgArgs & {
  name: string;
  description: string | null;
  type: string;
  notes: string | null;
  offSiteLocation: string | null;
  roomIds: string[];
  breakoutGroupId: string | null;
  // Optional — when present, we also create an initial schedule row. Times
  // are interpreted in the event's timezone.
  startTime: string | null;
  endTime: string | null;
};

export async function createFunctionCore(
  eventId: string,
  args: FunctionWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  // Wall-clock comparison: the zone shifts both ends alike.
  if (args.startTime && args.endTime && parseDateTimeInTimezone(args.endTime, "UTC") <= parseDateTimeInTimezone(args.startTime, "UTC")) {
    throw new Error("End time must be after start time");
  }
  await assertEventRefs(eventId, { roomIds: args.roomIds, breakoutGroupIds: [args.breakoutGroupId] });
  const defaults = await resolveCreateStatus(eventId, "FUNCTION");
  const numberData = await functionNumberData(eventId, null, args);

  const fn = await prisma.function.create({
    data: {
      ...esgData(args),
      ...numberData,
      name: args.name,
      description: args.description,
      type: args.type || "",
      notes: args.notes,
      offSiteLocation: args.offSiteLocation,
      eventId,
      breakoutGroupId: args.breakoutGroupId,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
      rooms: { create: args.roomIds.map((roomId) => ({ roomId })) },
    },
  });

  if (args.startTime && args.endTime) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { timezone: true },
    });
    const timezone = event?.timezone || "America/Chicago";
    await prisma.functionSchedule.create({
      data: {
        functionId: fn.id,
        type: await defaultScheduleType(eventId),
        startTime: parseDateTimeInTimezone(args.startTime, timezone),
        endTime: parseDateTimeInTimezone(args.endTime, timezone),
        sortOrder: 0,
      },
    });
  }

  const applied = await autoAssignDefaultWorkflowsCore("function", fn.id, eventId);
  await syncFunctionNumbers(eventId);
  return { ...fn, ...applied };
}

export type FunctionUpdateArgs = FunctionEsgArgs & {
  name: string;
  description: string | null;
  type: string;
  notes: string | null;
  offSiteLocation: string | null;
  roomIds: string[];
  breakoutGroupId: string | null;
};

export async function updateFunctionCore(
  id: string,
  eventId: string,
  args: FunctionUpdateArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: args.roomIds, breakoutGroupIds: [args.breakoutGroupId] });
  const numberData = await functionNumberData(eventId, id, args);
  // eventId in the where clause atomically verifies the function belongs to
  // the claimed event — guards against a caller passing another event's id.
  const fn = await prisma.function.update({
    where: { id, eventId },
    data: {
      ...esgData(args),
      ...numberData,
      name: args.name,
      description: args.description,
      type: args.type || "",
      notes: args.notes,
      offSiteLocation: args.offSiteLocation,
      breakoutGroupId: args.breakoutGroupId,
      updatedById: userId,
    },
  });

  // Replace room assignments (delete-all + create-all is atomic enough for
  // this scale — the FunctionRoom join carries no other state).
  await prisma.functionRoom.deleteMany({ where: { functionId: id } });
  if (args.roomIds.length > 0) {
    await prisma.functionRoom.createMany({
      data: args.roomIds.map((roomId) => ({ functionId: id, roomId })),
    });
  }
  await syncFunctionNumbers(eventId);
  return fn;
}

export async function deleteFunctionCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "DELETE", eventId);
  await retireFunctionNumbers(eventId, [id]);
  await prisma.function.delete({ where: { id, eventId } });
  await syncFunctionNumbers(eventId);
}

export async function deleteFunctionsCore(ids: string[], eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "DELETE", eventId);
  await retireFunctionNumbers(eventId, ids);
  const r = await prisma.function.deleteMany({ where: { id: { in: ids }, eventId } });
  await syncFunctionNumbers(eventId);
  return { count: r.count };
}

export type BulkFunctionUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  type?: string;
};

export async function bulkUpdateFunctionsCore(
  ids: string[],
  eventId: string,
  updates: BulkFunctionUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  const r = await prisma.function.updateMany({
    where: { id: { in: ids }, eventId },
    data: { ...updates, updatedById: userId },
  });
  // Cancelling drops a number while planning (kept once the ESG is issued).
  if (updates.status !== undefined) await syncFunctionNumbers(eventId);
  return { count: r.count };
}

export async function duplicateFunctionCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  const original = await prisma.function.findUnique({
    where: { id, eventId },
    include: { rooms: true, schedules: true },
  });
  if (!original) throw new PermissionError("NOT_FOUND");

  const duplicate = await prisma.function.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      notes: original.notes,
      offSiteLocation: original.offSiteLocation,
      eventId: original.eventId,
      // ESG details carry over; the copy gets its own number.
      postToReaderBoard: original.postToReaderBoard,
      readerBoardText: original.readerBoardText,
      hold24Hour: original.hold24Hour,
      defaultSetup: original.defaultSetup,
      expectedAttendance: original.expectedAttendance,
      setForCount: original.setForCount,
      decorNotes: original.decorNotes,
      securityNotes: original.securityNotes,
      signageNotes: original.signageNotes,
      billingNotes: original.billingNotes,
      costCenter: original.costCenter,
      updatedById: userId,
      rooms: { create: original.rooms.map((r) => ({ roomId: r.roomId })) },
    },
  });

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
  await syncFunctionNumbers(eventId);
  return duplicate;
}

// ---------------------------------------------------------------------------
// FunctionSchedule

export type ScheduleWriteArgs = {
  type: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  isPublic: boolean;
  // When true, skip room-conflict check (force the create/update).
  force: boolean;
};

type ScheduleResult<T> = { conflicts: RoomConflict[] } | { value: T };

export async function createScheduleCore(
  functionId: string,
  eventId: string,
  args: ScheduleWriteArgs,
  userId: string,
): Promise<ScheduleResult<{ id: string }>> {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);

  const [event, roomIds] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } }),
    args.force ? Promise.resolve([]) : getFunctionRoomIds(functionId),
  ]);
  const timezone = event?.timezone || "America/Chicago";
  const parsedStart = parseDateTimeInTimezone(args.startTime, timezone);
  const parsedEnd = parseDateTimeInTimezone(args.endTime, timezone);
  if (parsedEnd <= parsedStart) throw new Error("End time must be after start time");

  if (!args.force && roomIds.length > 0) {
    const conflicts = await checkRoomConflicts(roomIds, parsedStart, parsedEnd, functionId);
    if (conflicts.length > 0) return { conflicts };
  }

  const maxOrder = await prisma.functionSchedule.findFirst({
    where: { functionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.functionSchedule.create({
    data: {
      functionId,
      type: args.type,
      startTime: parsedStart,
      endTime: parsedEnd,
      notes: args.notes,
      isPublic: args.isPublic,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  await syncFunctionNumbers(eventId);
  return { value: { id: created.id } };
}

export async function updateScheduleCore(
  scheduleId: string,
  functionId: string,
  eventId: string,
  args: ScheduleWriteArgs,
  userId: string,
): Promise<ScheduleResult<{ id: string }>> {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);

  const [event, roomIds, stored] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } }),
    args.force ? Promise.resolve([]) : getFunctionRoomIds(functionId),
    prisma.functionSchedule.findFirst({ where: { id: scheduleId, function: { eventId } }, select: { startTime: true, endTime: true } }),
  ]);
  if (!stored) throw new PermissionError("NOT_FOUND", "Schedule not found");
  const timezone = event?.timezone || "America/Chicago";
  const parsedStart = parseDateTimeInTimezone(args.startTime, timezone);
  const parsedEnd = parseDateTimeInTimezone(args.endTime, timezone);
  // A row stored reversed before this check existed still saves its other edits.
  if (parsedEnd <= parsedStart && rangeTouched({ start: stored.startTime, end: stored.endTime }, parsedStart, parsedEnd)) {
    throw new Error("End time must be after start time");
  }

  if (!args.force && roomIds.length > 0) {
    const conflicts = await checkRoomConflicts(roomIds, parsedStart, parsedEnd, functionId);
    if (conflicts.length > 0) return { conflicts };
  }

  await prisma.functionSchedule.update({
    where: { id: scheduleId, function: { eventId } },
    data: {
      type: args.type,
      startTime: parsedStart,
      endTime: parsedEnd,
      notes: args.notes,
      isPublic: args.isPublic,
    },
  });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  await syncFunctionNumbers(eventId);
  return { value: { id: scheduleId } };
}

export async function deleteScheduleCore(
  scheduleId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "DELETE", eventId);
  await prisma.functionSchedule.delete({ where: { id: scheduleId, function: { eventId } } });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  await syncFunctionNumbers(eventId);
}

// ---------------------------------------------------------------------------
// FunctionContact

export async function addFunctionContactCore(
  functionId: string,
  eventId: string,
  contactId: string,
  role: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  await assertEventRefs(eventId, { contactIds: [contactId] });
  const link = await prisma.functionContact.create({
    data: { functionId, contactId, role },
  });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  return link;
}

export async function updateFunctionContactCore(
  functionContactId: string,
  functionId: string,
  eventId: string,
  role: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  const link = await prisma.functionContact.update({
    where: { id: functionContactId, function: { eventId } },
    data: { role },
  });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  return link;
}

export async function removeFunctionContactCore(
  functionContactId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await prisma.functionContact.delete({ where: { id: functionContactId, function: { eventId } } });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
}

export type CreateAndAddFunctionContactArgs = {
  functionId: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  role: string | null;
};

export async function createAndAddFunctionContactCore(
  args: CreateAndAddFunctionContactArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", args.eventId);
  await assertFunctionInEvent(args.functionId, args.eventId);

  const contact = await prisma.contact.create({
    data: {
      tenantId: await requireEventTenantId(args.eventId),
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      organization: args.organization,
      updatedById: userId,
    },
  });
  const link = await prisma.functionContact.create({
    data: { functionId: args.functionId, contactId: contact.id, role: args.role },
  });
  await prisma.function.update({
    where: { id: args.functionId },
    data: { updatedById: userId },
  });
  return link;
}

// ---------------------------------------------------------------------------
// Agenda DnD ops

export async function updateFunctionRoomCore(
  functionId: string,
  oldRoomId: string,
  newRoomId: string,
  eventId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  await assertEventRefs(eventId, { roomIds: [newRoomId] });
  if (oldRoomId === newRoomId) return { success: true };

  const existing = await prisma.functionRoom.findUnique({
    where: { functionId_roomId: { functionId, roomId: newRoomId } },
  });
  if (existing) return { success: false, error: "Room already assigned to this function" };

  await prisma.$transaction([
    prisma.functionRoom.delete({
      where: { functionId_roomId: { functionId, roomId: oldRoomId } },
    }),
    prisma.functionRoom.create({ data: { functionId, roomId: newRoomId } }),
  ]);
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  return { success: true };
}

export async function scheduleUnscheduledFunctionCore(
  functionId: string,
  roomId: string,
  startTime: string,
  endTime: string,
  eventId: string,
  force: boolean,
  userId: string,
): Promise<{ success: boolean; error?: string; conflicts?: RoomConflict[] }> {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertFunctionInEvent(functionId, eventId);
  await assertEventRefs(eventId, { roomIds: [roomId] });
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) return { success: false, error: "End time must be after start time" };

  if (!force) {
    const conflicts = await checkRoomConflicts([roomId], start, end, functionId);
    if (conflicts.length > 0) return { success: false, conflicts };
  }

  await prisma.functionRoom.upsert({
    where: { functionId_roomId: { functionId, roomId } },
    create: { functionId, roomId },
    update: {},
  });

  await prisma.functionSchedule.create({
    data: {
      functionId,
      type: await defaultScheduleType(eventId),
      startTime: start,
      endTime: end,
      sortOrder: 0,
    },
  });
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  await syncFunctionNumbers(eventId);
  return { success: true };
}

export async function rescheduleEntryCore(
  scheduleId: string,
  functionId: string,
  newStartTime: string,
  newEndTime: string,
  eventId: string,
  force: boolean,
  userId: string,
): Promise<{ success: boolean; error?: string; conflicts?: RoomConflict[] }> {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
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
  await prisma.function.update({ where: { id: functionId, eventId }, data: { updatedById: userId } });
  await syncFunctionNumbers(eventId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Function numbering (ESG)

export async function renumberFunctionsCore(eventId: string, clearPins: boolean, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await renumberFunctions(eventId, clearPins);
}

export async function setFunctionNumbersLockedCore(eventId: string, locked: boolean, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  await setFunctionNumbersLocked(eventId, locked);
}

// ESG Part II / IIIa details card on the function page (number override,
// reader board, 24-hour hold, counts, décor / security / signage / billing).
export async function updateFunctionEsgCore(
  id: string,
  eventId: string,
  args: FunctionEsgArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  const numberData = await functionNumberData(eventId, id, args);
  const fn = await prisma.function.update({
    where: { id, eventId },
    data: { ...esgData(args), ...numberData, updatedById: userId },
  });
  if (args.functionNumber !== undefined) await syncFunctionNumbers(eventId);
  return fn;
}
