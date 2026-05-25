import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  LANDING_PAGE: "landing_page",
  LAST_EVENT_ID: "last_event_id",
  AGENDA_SHOW_UNUSED_ROOMS: "agenda_show_unused_rooms",
  AGENDA_SHOW_FULL_DAY_ROOMS: "agenda_show_full_day_rooms",
  AGENDA_COLLAPSE_EMPTY_HOURS: "agenda_collapse_empty_hours",
} as const;

export type LandingPageOption = "dashboard" | "events" | "last_event";

export const VALID_LANDING_PAGES: LandingPageOption[] = ["dashboard", "events", "last_event"];

export async function getUserSetting(userId: string, key: string): Promise<string | null> {
  const setting = await prisma.userSetting.findUnique({
    where: { userId_key: { userId, key } },
    select: { value: true },
  });
  return setting?.value ?? null;
}

export async function setUserSetting(userId: string, key: string, value: string): Promise<void> {
  await prisma.userSetting.upsert({
    where: { userId_key: { userId, key } },
    update: { value },
    create: { userId, key, value },
  });
}

export async function getUserLandingPage(userId: string): Promise<LandingPageOption> {
  const value = await getUserSetting(userId, SETTING_KEYS.LANDING_PAGE);
  if (value && (VALID_LANDING_PAGES as string[]).includes(value)) {
    return value as LandingPageOption;
  }
  return "dashboard";
}

export async function getLastEventId(userId: string): Promise<string | null> {
  return getUserSetting(userId, SETTING_KEYS.LAST_EVENT_ID);
}

export type AgendaViewSettings = {
  showUnusedRooms: boolean;
  showFullDayRooms: boolean;
  collapseEmptyHours: boolean;
};

export const DEFAULT_AGENDA_VIEW_SETTINGS: AgendaViewSettings = {
  showUnusedRooms: false,
  showFullDayRooms: false,
  collapseEmptyHours: false,
};

export async function getAgendaViewSettings(userId: string): Promise<AgendaViewSettings> {
  const [unusedRooms, fullDayRooms, collapseHours] = await Promise.all([
    getUserSetting(userId, SETTING_KEYS.AGENDA_SHOW_UNUSED_ROOMS),
    getUserSetting(userId, SETTING_KEYS.AGENDA_SHOW_FULL_DAY_ROOMS),
    getUserSetting(userId, SETTING_KEYS.AGENDA_COLLAPSE_EMPTY_HOURS),
  ]);
  return {
    showUnusedRooms: unusedRooms === "true",
    showFullDayRooms: fullDayRooms === "true",
    collapseEmptyHours: collapseHours === "true",
  };
}

export function agendaRoomPrefsKey(eventId: string): string {
  return `agenda_room_prefs_${eventId}`;
}

export function packingProviderFilterKey(eventId: string): string {
  return `packing_provider_filter_${eventId}`;
}

export type AgendaRoomPrefs = {
  hiddenRoomIds: string[];
  roomOrder: string[];
};

export async function getAgendaRoomPrefs(userId: string, eventId: string): Promise<AgendaRoomPrefs> {
  const value = await getUserSetting(userId, agendaRoomPrefsKey(eventId));
  if (!value) return { hiddenRoomIds: [], roomOrder: [] };
  try {
    const parsed = JSON.parse(value);
    return {
      hiddenRoomIds: Array.isArray(parsed.hiddenRoomIds) ? parsed.hiddenRoomIds : [],
      roomOrder: Array.isArray(parsed.roomOrder) ? parsed.roomOrder : [],
    };
  } catch {
    return { hiddenRoomIds: [], roomOrder: [] };
  }
}
