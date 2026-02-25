"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getBreakoutGroups(eventId: string) {
  const groups = await prisma.breakoutGroup.findMany({
    where: { eventId },
    include: {
      functions: {
        where: { type: "BREAKOUT_BLOCK" },
        include: {
          schedules: { orderBy: { startTime: "asc" } },
          rooms: { include: { room: true }, orderBy: { id: "asc" } },
          presentationSlots: {
            include: {
              presentation: true,
              room: true,
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Sort functions within each group by earliest schedule startTime
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
  const blocks = await prisma.function.findMany({
    where: {
      eventId,
      type: "BREAKOUT_BLOCK",
      breakoutGroupId: null,
    },
    include: {
      schedules: { orderBy: { startTime: "asc" } },
      rooms: { include: { room: true }, orderBy: { id: "asc" } },
      presentationSlots: {
        include: {
          presentation: true,
          room: true,
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
  const name = formData.get("name") as string;

  await prisma.breakoutGroup.update({
    where: { id: groupId },
    data: { name },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function deleteBreakoutGroup(groupId: string, eventId: string) {
  await prisma.breakoutGroup.delete({ where: { id: groupId } });
  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function assignPresentationToBlock(
  presentationId: string,
  functionId: string,
  roomId: string | null,
  eventId: string
) {
  // Check room not already taken in this block
  if (roomId) {
    const conflict = await prisma.presentationSlot.findFirst({
      where: { functionId, roomId },
    });
    if (conflict) {
      throw new Error("That room is already assigned in this block");
    }
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
}

export async function updateSlotRoom(
  slotId: string,
  roomId: string | null,
  eventId: string
) {
  await prisma.presentationSlot.update({
    where: { id: slotId },
    data: { roomId: roomId || null },
  });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
}

export async function removePresentationFromBlock(slotId: string, eventId: string) {
  const slot = await prisma.presentationSlot.findUnique({
    where: { id: slotId },
    select: { presentationId: true },
  });

  await prisma.presentationSlot.delete({ where: { id: slotId } });

  revalidatePath(`/events/${eventId}/breakout-schedule`);
  if (slot) {
    revalidatePath(`/events/${eventId}/presentations/${slot.presentationId}`);
  }
}

export async function getAvailableBlocksForPresentation(
  presentationId: string,
  eventId: string
) {
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
