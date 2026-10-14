// ESG §I Function Space, derived from the event's functions. Each function
// type's option group (FUNCTION_SPACES) picks the line it is listed under;
// untagged types list their rooms under "Function rooms", and off-site
// functions under "Off-site venue(s)". Pure.

import { formatTime } from "@/lib/agendaUtils";
import type { FunctionSpace } from "@/lib/esg/apex";
import { formatDayDate } from "@/lib/esg/format";

const NARRATIVE_KEY: Record<FunctionSpace, string> = {
  REGISTRATION: "registrationAreas",
  OFFICE: "offices",
  SPEAKER_READY: "speakerReadyRooms",
  PRESS: "pressRoom",
  LOUNGE: "lounges",
  MESSAGE_CENTER: "messageCenter",
  STORAGE: "storage",
};

type RoomRef = { name: string; venueName: string };

export type FunctionSpaceInput = {
  name: string;
  type: string;
  offSiteLocation: string | null;
  rooms: RoomRef[];
  schedules: { startTime: Date; endTime: Date }[];
};

function roomLabel(r: RoomRef, multiVenue: boolean) {
  return multiVenue ? `${r.name} (${r.venueName})` : r.name;
}

function span(schedules: FunctionSpaceInput["schedules"], timezone: string): string | null {
  if (schedules.length === 0) return null;
  const start = new Date(Math.min(...schedules.map((s) => s.startTime.getTime())));
  const end = new Date(Math.max(...schedules.map((s) => s.endTime.getTime())));
  const startDay = formatDayDate(start, timezone);
  const endDay = formatDayDate(end, timezone);
  return startDay === endDay
    ? `${startDay}, ${formatTime(start, timezone)} – ${formatTime(end, timezone)}`
    : `${startDay} – ${endDay}`;
}

export function deriveFunctionSpace(
  functions: FunctionSpaceInput[],
  spaceByType: Map<string, FunctionSpace>,
  // Rooms assigned to breakout groups, labeled with the group name.
  breakoutRooms: (RoomRef & { groupName: string })[],
  timezone: string,
): Record<string, string> {
  const multiVenue =
    new Set([...functions.flatMap((f) => f.rooms), ...breakoutRooms].map((r) => r.venueName)).size > 1;
  const lines = new Map<string, string[]>();
  const push = (key: string, line: string) => lines.set(key, [...(lines.get(key) ?? []), line]);

  // Function rooms: one line per room, naming what uses it.
  const roomUse = new Map<string, string[]>();
  const addRoomUse = (room: string, user: string) => {
    const users = roomUse.get(room) ?? [];
    if (!users.includes(user)) users.push(user);
    roomUse.set(room, users);
  };

  for (const fn of functions) {
    if (fn.offSiteLocation) {
      push("offsiteVenues", `${fn.offSiteLocation} — ${fn.name}`);
      continue;
    }
    const space = spaceByType.get(fn.type);
    if (space) {
      const parts = [fn.rooms.map((r) => roomLabel(r, multiVenue)).join(", "), span(fn.schedules, timezone)].filter(Boolean);
      push(NARRATIVE_KEY[space], [fn.name, ...parts].join(" — "));
    } else {
      for (const r of fn.rooms) addRoomUse(roomLabel(r, multiVenue), fn.name);
    }
  }
  for (const r of breakoutRooms) addRoomUse(roomLabel(r, multiVenue), r.groupName);
  for (const [room, users] of Array.from(roomUse.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    push("functionRooms", `${room} — ${users.join(", ")}`);
  }

  return Object.fromEntries(Array.from(lines.entries()).map(([k, v]) => [k, v.join("\n")]));
}
