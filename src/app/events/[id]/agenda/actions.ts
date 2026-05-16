"use server";

import { requirePermission } from "@/lib/permissions";
import { setUserSetting, SETTING_KEYS, type AgendaViewSettings, agendaRoomPrefsKey, type AgendaRoomPrefs } from "@/lib/userSettings";

export async function saveAgendaViewSettings(settings: AgendaViewSettings) {
  const session = await requirePermission("EVENTS", "VIEW");
  await Promise.all([
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_SHOW_UNUSED_ROOMS, String(settings.showUnusedRooms)),
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_SHOW_FULL_DAY_ROOMS, String(settings.showFullDayRooms)),
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_COLLAPSE_EMPTY_HOURS, String(settings.collapseEmptyHours)),
  ]);
}

export async function saveAgendaRoomPrefs(eventId: string, prefs: AgendaRoomPrefs): Promise<void> {
  const session = await requirePermission("FUNCTIONS", "VIEW", eventId);
  await setUserSetting(session.user.id, agendaRoomPrefsKey(eventId), JSON.stringify(prefs));
}
