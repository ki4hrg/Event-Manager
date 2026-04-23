"use client";

import { saveAgendaViewSettings } from "./actions";
import type { AgendaViewSettings } from "@/lib/userSettings";

export type { AgendaViewSettings };

export function AgendaViewOptions({
  settings,
  onChange,
}: {
  settings: AgendaViewSettings;
  onChange: (settings: AgendaViewSettings) => void;
}) {
  function toggle(key: keyof AgendaViewSettings) {
    const next = { ...settings, [key]: !settings[key] };
    onChange(next);
    saveAgendaViewSettings(next);
  }

  return (
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.showUnusedRooms}
          onChange={() => toggle("showUnusedRooms")}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        Show unused rooms
      </label>
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.showFullDayRooms}
          onChange={() => toggle("showFullDayRooms")}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        Show full-day rooms
      </label>
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.collapseEmptyHours}
          onChange={() => toggle("collapseEmptyHours")}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        Collapse empty hours
      </label>
    </div>
  );
}
