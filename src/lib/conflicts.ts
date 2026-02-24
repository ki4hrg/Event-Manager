import { prisma } from "@/lib/prisma";

export type RoomConflict = {
  roomId: string;
  roomName: string;
  conflictType: "function" | "presentation";
  conflictName: string;
  conflictId: string;
  startTime: Date;
  endTime: Date;
};

/**
 * Check for room conflicts against both FunctionSchedules and PresentationSessions.
 * Returns any overlapping bookings for the given rooms and time range.
 */
export async function checkRoomConflicts(
  roomIds: string[],
  startTime: Date,
  endTime: Date,
  excludePresentationSessionId?: string,
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

  // Check PresentationSession conflicts
  const sessionRooms = await prisma.presentationSessionRoom.findMany({
    where: { roomId: { in: roomIds } },
    include: {
      room: true,
      session: {
        include: {
          presentation: true,
        },
      },
    },
  });

  for (const sr of sessionRooms) {
    // Skip if we're excluding this session
    if (excludePresentationSessionId && sr.sessionId === excludePresentationSessionId) {
      continue;
    }

    const session = sr.session;
    // Check for time overlap
    if (session.startTime < endTime && session.endTime > startTime) {
      conflicts.push({
        roomId: sr.roomId,
        roomName: sr.room.name,
        conflictType: "presentation",
        conflictName: session.presentation.title,
        conflictId: session.presentationId,
        startTime: session.startTime,
        endTime: session.endTime,
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
