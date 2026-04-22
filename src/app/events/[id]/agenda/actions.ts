"use server";

import { requireAuth } from "@/lib/auth";
import { setUserSetting, SETTING_KEYS } from "@/lib/userSettings";

export async function saveAgendaViewSettings(showUnusedRooms: boolean, showFullDayRooms: boolean) {
  const session = await requireAuth();
  await Promise.all([
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_SHOW_UNUSED_ROOMS, String(showUnusedRooms)),
    setUserSetting(session.user.id, SETTING_KEYS.AGENDA_SHOW_FULL_DAY_ROOMS, String(showFullDayRooms)),
  ]);
}
