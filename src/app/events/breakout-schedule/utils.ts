import type { BreakoutGroupRoom, BreakoutSessionRoomOverride, FunctionRoom, Room } from "@prisma/client";
import { formatTimeRange } from "@/lib/agendaUtils";

type SessionForRooms = {
  rooms: (FunctionRoom & { room: Room })[];
  sessionRoomOverrides: BreakoutSessionRoomOverride[];
};

export function getEffectiveRooms(
  session: SessionForRooms,
  groupRooms: (BreakoutGroupRoom & { room: Room })[]
): Room[] {
  const excludedIds = new Set(
    session.sessionRoomOverrides.filter((o) => o.type === "exclude").map((o) => o.roomId)
  );
  const includedOverrides = session.sessionRoomOverrides.filter((o) => o.type === "include");

  const rooms = groupRooms
    .filter((gr) => !excludedIds.has(gr.roomId))
    .map((gr) => gr.room);

  for (const override of includedOverrides) {
    if (!rooms.some((r) => r.id === override.roomId)) {
      const fr = session.rooms.find((fr) => fr.roomId === override.roomId);
      if (fr) rooms.push(fr.room);
    }
  }

  return rooms;
}

export function formatSessionTime(
  schedules: { startTime: Date; endTime: Date }[],
  timezone: string
): string {
  if (schedules.length === 0) return "No time set";
  const s = schedules[0];
  return formatTimeRange(new Date(s.startTime), new Date(s.endTime), timezone);
}

export function getPrimaryNames(
  speakers: { isPrimary: boolean; contact: { firstName: string; lastName: string } }[]
): string | null {
  const primaries = speakers.filter((s) => s.isPrimary);
  const source = primaries.length > 0 ? primaries : speakers.slice(0, 1);
  if (source.length === 0) return null;
  return source.map((s) => `${s.contact.firstName} ${s.contact.lastName}`).join(", ");
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
