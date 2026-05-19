"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import { parseDateTimeInTimezone } from "@/lib/timezones";

async function assertBreakoutGroupInEvent(groupId: string, eventId: string) {
  const found = await prisma.breakoutGroup.findUnique({ where: { id: groupId, eventId }, select: { id: true } });
  if (!found) notFound();
}

async function assertSessionInEvent(functionId: string, eventId: string) {
  const found = await prisma.function.findUnique({ where: { id: functionId, eventId, type: "BREAKOUT_BLOCK" }, select: { id: true } });
  if (!found) notFound();
}

async function assertPresentationInEvent(presentationId: string, eventId: string) {
  const found = await prisma.presentation.findUnique({ where: { id: presentationId, eventId }, select: { id: true } });
  if (!found) notFound();
}

// ── Group CRUD ─────────────────────────────────────────────────────────────────

export async function getBreakoutGroups(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  const groups = await prisma.breakoutGroup.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true }, orderBy: { id: "asc" } },
      functions: {
        where: { type: "BREAKOUT_BLOCK" },
        include: {
          schedules: { orderBy: { startTime: "asc" } },
          rooms: { include: { room: true }, orderBy: { id: "asc" } },
          sessionRoomOverrides: true,
          presentationSlots: {
            include: {
              presentation: {
                include: {
                  speakers: { include: { contact: true } },
                  advancerVendor: { select: { id: true, name: true } },
                  advancerContact: { select: { id: true, firstName: true, lastName: true } },
                },
              },
              room: true,
              advancerVendor: { select: { id: true, name: true } },
              advancerContact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      presentations: {
        include: {
          slots: true,
          track: true,
          speakers: { include: { contact: true } },
          advancerVendor: { select: { id: true, name: true } },
          advancerContact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Sort sessions within each group by earliest schedule startTime
  for (const group of groups) {
    group.functions.sort((a, b) => {
      const aTime = a.schedules[0]?.startTime.getTime() ?? Infinity;
      const bTime = b.schedules[0]?.startTime.getTime() ?? Infinity;
      return aTime - bTime;
    });
  }

  return groups;
}

export async function getUngroupedBlocks(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  const blocks = await prisma.function.findMany({
    where: {
      eventId,
      type: "BREAKOUT_BLOCK",
      breakoutGroupId: null,
    },
    include: {
      schedules: { orderBy: { startTime: "asc" } },
      rooms: { include: { room: true }, orderBy: { id: "asc" } },
      sessionRoomOverrides: true,
      presentationSlots: {
        include: {
          presentation: {
            include: {
              speakers: { include: { contact: true } },
              advancerVendor: { select: { id: true, name: true } },
              advancerContact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          room: true,
          advancerVendor: { select: { id: true, name: true } },
          advancerContact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  blocks.sort((a, b) => {
    const aTime = a.schedules[0]?.startTime.getTime() ?? Infinity;
    const bTime = b.schedules[0]?.startTime.getTime() ?? Infinity;
    return aTime - bTime;
  });

  return blocks;
}

export async function createBreakoutGroup(eventId: string, formData: FormData) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const name = formData.get("name") as string;

  const maxOrder = await prisma.breakoutGroup.findFirst({
    where: { eventId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.breakoutGroup.create({
    data: {
      name,
      eventId,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function updateBreakoutGroup(
  groupId: string,
  eventId: string,
  formData: FormData
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const name = formData.get("name") as string;

  await prisma.breakoutGroup.update({
    where: { id: groupId, eventId },
    data: { name },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function deleteBreakoutGroup(groupId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.breakoutGroup.delete({ where: { id: groupId, eventId } });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

// ── Group Room Management ──────────────────────────────────────────────────────

export async function addRoomToGroup(groupId: string, roomId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertBreakoutGroupInEvent(groupId, eventId);
  await prisma.breakoutGroupRoom.create({
    data: { breakoutGroupId: groupId, roomId },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function removeRoomFromGroup(groupId: string, roomId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertBreakoutGroupInEvent(groupId, eventId);
  // Get all sessions in this group
  const sessions = await prisma.function.findMany({
    where: { breakoutGroupId: groupId, type: "BREAKOUT_BLOCK" },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  await prisma.$transaction([
    // Remove any presentation slots using this room in group sessions
    prisma.presentationSlot.deleteMany({
      where: { functionId: { in: sessionIds }, roomId },
    }),
    // Remove any session overrides for this room
    prisma.breakoutSessionRoomOverride.deleteMany({
      where: { functionId: { in: sessionIds }, roomId },
    }),
    // Remove the group room
    prisma.breakoutGroupRoom.delete({
      where: { breakoutGroupId_roomId: { breakoutGroupId: groupId, roomId } },
    }),
  ]);

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

// ── Session Room Overrides ─────────────────────────────────────────────────────

export async function setSessionRoomOverride(
  functionId: string,
  roomId: string,
  type: "exclude" | "include",
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertSessionInEvent(functionId, eventId);
  await prisma.breakoutSessionRoomOverride.upsert({
    where: { functionId_roomId: { functionId, roomId } },
    update: { type },
    create: { functionId, roomId, type },
  });

  // If excluding a room, remove any presentation slots in that room for this session
  if (type === "exclude") {
    await prisma.presentationSlot.deleteMany({
      where: { functionId, roomId },
    });
  }

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function removeSessionRoomOverride(
  functionId: string,
  roomId: string,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertSessionInEvent(functionId, eventId);
  await prisma.breakoutSessionRoomOverride.delete({
    where: { functionId_roomId: { functionId, roomId } },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

// ── Session Management ─────────────────────────────────────────────────────────

export async function createSessionInGroup(
  groupId: string,
  eventId: string,
  formData: FormData
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertBreakoutGroupInEvent(groupId, eventId);
  const name = formData.get("name") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  const fn = await prisma.function.create({
    data: {
      name,
      type: "BREAKOUT_BLOCK",
      eventId,
      breakoutGroupId: groupId,
    },
  });

  await prisma.functionSchedule.create({
    data: {
      functionId: fn.id,
      type: "SESSION",
      startTime: parseDateTimeInTimezone(startTime, timezone),
      endTime: parseDateTimeInTimezone(endTime, timezone),
      sortOrder: 0,
    },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function updateSession(
  functionId: string,
  eventId: string,
  formData: FormData
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const name = formData.get("name") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  const timezone = event?.timezone || "America/Chicago";

  await prisma.function.update({
    where: { id: functionId, eventId },
    data: { name },
  });

  // Update the first schedule (the main session time)
  const schedule = await prisma.functionSchedule.findFirst({
    where: { functionId, function: { eventId } },
    orderBy: { sortOrder: "asc" },
  });

  if (schedule) {
    await prisma.functionSchedule.update({
      where: { id: schedule.id },
      data: {
        startTime: parseDateTimeInTimezone(startTime, timezone),
        endTime: parseDateTimeInTimezone(endTime, timezone),
      },
    });
  }

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function deleteSession(functionId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.function.delete({ where: { id: functionId, eventId } });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

// ── Presentation Slot Management ───────────────────────────────────────────────

export async function assignPresentationToSession(
  presentationId: string,
  functionId: string,
  roomId: string | null,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertSessionInEvent(functionId, eventId);
  await assertPresentationInEvent(presentationId, eventId);
  // Check room not already taken in this session
  if (roomId) {
    const conflict = await prisma.presentationSlot.findFirst({
      where: { functionId, roomId },
    });
    if (conflict) {
      return { success: false, error: "That room is already assigned in this session" };
    }
  }

  // Check presentation not already in this session
  const existing = await prisma.presentationSlot.findUnique({
    where: { functionId_presentationId: { functionId, presentationId } },
  });
  if (existing) {
    return { success: false, error: "This presentation is already assigned to this session" };
  }

  await prisma.presentationSlot.create({
    data: {
      functionId,
      presentationId,
      roomId: roomId || null,
    },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  return { success: true };
}

export async function movePresentationSlot(
  slotId: string,
  newFunctionId: string,
  newRoomId: string | null,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  // Verify the slot belongs to a function in this event and the target function also does.
  const slot = await prisma.presentationSlot.findUnique({
    where: { id: slotId, function: { eventId } },
  });
  if (!slot) return { success: false, error: "Slot not found" };
  await assertSessionInEvent(newFunctionId, eventId);

  const sameSess = slot.functionId === newFunctionId;
  const sameRoom = slot.roomId === newRoomId;

  if (sameSess && sameRoom) return { success: true };

  // If moving to a new session, check no duplicate
  if (!sameSess) {
    const dup = await prisma.presentationSlot.findUnique({
      where: { functionId_presentationId: { functionId: newFunctionId, presentationId: slot.presentationId } },
    });
    if (dup) return { success: false, error: "Presentation is already in that session" };
  }

  // Check room not already taken in target session
  if (newRoomId) {
    const conflict = await prisma.presentationSlot.findFirst({
      where: { functionId: newFunctionId, roomId: newRoomId, id: { not: slotId } },
    });
    if (conflict) return { success: false, error: "That room is already occupied in this session" };
  }

  if (sameSess) {
    // Just update room
    await prisma.presentationSlot.update({
      where: { id: slotId },
      data: { roomId: newRoomId },
    });
  } else {
    // Move to new session
    await prisma.$transaction([
      prisma.presentationSlot.delete({ where: { id: slotId } }),
      prisma.presentationSlot.create({
        data: {
          functionId: newFunctionId,
          presentationId: slot.presentationId,
          roomId: newRoomId,
        },
      }),
    ]);
  }

  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${slot.presentationId}`);
  return { success: true };
}

export async function removePresentationFromSession(slotId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const slot = await prisma.presentationSlot.findUnique({
    where: { id: slotId, function: { eventId } },
    select: { presentationId: true },
  });
  if (!slot) notFound();

  await prisma.presentationSlot.delete({ where: { id: slotId } });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
  if (slot) {
    revalidatePath(`/events/${eventId}/presentations/${slot.presentationId}`);
  }
}

// ── Group Presentation Management ──────────────────────────────────────────────

export async function assignPresentationToGroup(
  presentationId: string,
  groupId: string,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertBreakoutGroupInEvent(groupId, eventId);
  await prisma.presentation.update({
    where: { id: presentationId, eventId },
    data: { breakoutGroupId: groupId },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unassignPresentationFromGroup(
  presentationId: string,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await prisma.presentation.update({
    where: { id: presentationId, eventId },
    data: { breakoutGroupId: null },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailablePresentationsForGroup(
  groupId: string,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.presentation.findMany({
    where: { eventId, NOT: { breakoutGroupId: groupId } },
    select: {
      id: true,
      title: true,
      instanceCount: true,
      track: { select: { color: true } },
      speakers: {
        select: { isPrimary: true, contact: { select: { firstName: true, lastName: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { title: "asc" },
  });
}

export async function createGroupPresentation(
  groupId: string,
  eventId: string,
  formData: FormData
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertBreakoutGroupInEvent(groupId, eventId);
  const title = formData.get("title") as string;
  const instanceCountRaw = formData.get("instanceCount") as string;
  const instanceCount = instanceCountRaw ? parseInt(instanceCountRaw) : 1;

  await prisma.presentation.create({
    data: {
      title,
      instanceCount,
      breakoutGroupId: groupId,
      eventId,
    },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations`);
}

// ── Legacy aliases (used by BreakoutSlotPanel) ─────────────────────────────────

export async function assignPresentationToBlock(
  presentationId: string,
  functionId: string,
  roomId: string | null,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const result = await assignPresentationToSession(presentationId, functionId, roomId, eventId);
  if (!result.success) throw new Error(result.error);
}

export async function removePresentationFromBlock(slotId: string, eventId: string) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  return removePresentationFromSession(slotId, eventId);
}

export async function updateSlotRoom(
  slotId: string,
  roomId: string | null,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await prisma.presentationSlot.update({
    where: { id: slotId, function: { eventId } },
    data: { roomId: roomId || null },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function setSlotAdvancer(
  slotId: string,
  eventId: string,
  advancerVendorId: string | null,
  advancerContactId: string | null,
) {
  await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const slot = await prisma.presentationSlot.update({
    where: { id: slotId, function: { eventId } },
    data: {
      advancerVendorId: advancerVendorId || null,
      advancerContactId: advancerContactId || null,
    },
    select: { presentationId: true },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${slot.presentationId}`);
}

export async function clearSlotAdvancer(slotId: string, eventId: string) {
  await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const slot = await prisma.presentationSlot.update({
    where: { id: slotId, function: { eventId } },
    data: { advancerVendorId: null, advancerContactId: null },
    select: { presentationId: true },
  });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${slot.presentationId}`);
}

export async function getAvailableBlocksForPresentation(
  presentationId: string,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.function.findMany({
    where: {
      eventId,
      type: "BREAKOUT_BLOCK",
      presentationSlots: {
        none: { presentationId },
      },
    },
    include: {
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function removeAllBreakoutAssignments(
  presentationId: string,
  eventId: string
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  await assertPresentationInEvent(presentationId, eventId);
  await prisma.$transaction([
    prisma.presentationSlot.deleteMany({ where: { presentationId, function: { eventId } } }),
    prisma.presentation.update({
      where: { id: presentationId, eventId },
      data: { breakoutGroupId: null },
    }),
  ]);
  revalidatePath(`/events/${eventId}/breakout-schedule`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}
