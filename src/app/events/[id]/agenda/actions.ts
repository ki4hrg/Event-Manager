"use server";

import { requireAuth } from "@/lib/auth";
import { setUserSetting, SETTING_KEYS, type AgendaViewSettings } from "@/lib/userSettings";

export async function saveAgendaViewSettings(settings: AgendaViewSettings) {
  const session = await requireAuth();
  await Promise.all([
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_SHOW_UNUSED_ROOMS, String(settings.showUnusedRooms)),
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_SHOW_FULL_DAY_ROOMS, String(settings.showFullDayRooms)),
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_COLLAPSE_EMPTY_HOURS, String(settings.collapseEmptyHours)),
  ]);
}
