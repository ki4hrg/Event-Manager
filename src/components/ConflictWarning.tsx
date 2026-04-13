"use client";

import type { RoomConflict } from "@/lib/conflicts";

function formatConflictTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function ConflictWarning({
  conflicts,
  timezone,
  onCancel,
  onConfirm,
  confirmLabel = "Schedule anyway",
}: {
  conflicts: RoomConflict[];
  timezone: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
        This time slot conflicts with existing bookings:
      </p>
      <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 mb-3">
        {conflicts.map((c, i) => (
          <li key={i}>
            <span className="font-medium">{c.roomName}</span>: &ldquo;{c.conflictName}&rdquo; (
            {formatConflictTime(c.startTime, timezone)} &ndash;{" "}
            {formatConflictTime(c.endTime, timezone)})
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
