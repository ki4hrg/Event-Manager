"use client";

export type AgendaViewSettings = {
  showUnusedRooms: boolean;
  showFullDayRooms: boolean;
};

const STORAGE_KEY = "agenda-view-options";

const DEFAULTS: AgendaViewSettings = {
  showUnusedRooms: false,
  showFullDayRooms: false,
};

export function loadAgendaViewSettings(): AgendaViewSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: AgendaViewSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function AgendaViewOptions({
  settings,
  onChange,
}: {
  settings: AgendaViewSettings;
  onChange: (settings: AgendaViewSettings) => void;
}) {
  function toggle(key: keyof AgendaViewSettings) {
    const next = { ...settings, [key]: !settings[key] };
    saveSettings(next);
    onChange(next);
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
    </div>
  );
}
