import { prisma } from "@/lib/prisma";

export type RoomConflict = {
  roomId: string;
  roomName: string;
  conflictType: "function";
  conflictName: string;
  conflictId: string;
  startTime: Date;
  endTime: Date;
};

/**
 * Check for room conflicts against FunctionSchedules.
 * Returns any overlapping bookings for the given rooms and time range.
 */
export async function checkRoomConflicts(
  roomIds: string[],
  startTime: Date,
  endTime: Date,
  excludeFunctionId?: string
): Promise<RoomConflict[]> {
  if (roomIds.length === 0) {
    return [];
  }

  const conflicts: RoomConflict[] = [];

  // Check FunctionSchedule conflicts
  // First get functions that use these rooms
  const functionsUsingRooms = await prisma.functionRoom.findMany({
    where: { roomId: { in: roomIds } },
    include: {
      room: true,
      function: {
        include: {
          schedules: {
            where: {
              // Overlapping time check: existing.start < new.end AND existing.end > new.start
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          },
        },
      },
    },
  });

  for (const fr of functionsUsingRooms) {
    // Skip if we're excluding this function
    if (excludeFunctionId && fr.functionId === excludeFunctionId) {
      continue;
    }

    for (const schedule of fr.function.schedules) {
      conflicts.push({
        roomId: fr.roomId,
        roomName: fr.room.name,
        conflictType: "function",
        conflictName: fr.function.name,
        conflictId: fr.functionId,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });
    }
  }

  return conflicts;
}

/**
 * Format a conflict for display
 */
export function formatConflict(conflict: RoomConflict, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const start = formatter.format(conflict.startTime);
  const end = formatter.format(conflict.endTime);
  const typeLabel = conflict.conflictType === "function" ? "Function" : "Presentation";

  return `${conflict.roomName}: ${typeLabel} "${conflict.conflictName}" (${start} - ${end})`;
}
