"use client";

import Link from "next/link";
import {
  type SerializedAgendaData,
  type AgendaData,
  type AgendaEntry,
  deserializeAgendaData,
  computeRowspan,
  formatDateHeading,
  formatTime,
  getUsedRoomIds,
} from "@/lib/agendaUtils";
import { DateTabs } from "./DateTabs";
import { HideEmptyToggle } from "./HideEmptyToggle";

type AgendaGridProps = {
  eventId: string;
  agendaData: SerializedAgendaData;
  timezone: string;
  activeDate: string | null;
  hideEmpty: boolean;
};

function EntryCard({
  entry,
  eventId,
  timezone,
}: {
  entry: AgendaEntry;
  eventId: string;
  timezone: string;
}) {
  return (
    <div className="rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-1.5 text-xs mb-1 last:mb-0">
      <Link
        href={`/events/${eventId}/functions/${entry.functionId}`}
        className="font-medium text-blue-700 dark:text-blue-300 hover:underline block truncate leading-tight"
      >
        {entry.functionName}
      </Link>
      <div className="text-gray-500 dark:text-gray-400 leading-tight mt-0.5 truncate">
        {formatTime(entry.startTime, timezone)} –{" "}
        {formatTime(entry.endTime, timezone)}
        {entry.scheduleType && (
          <span className="ml-1 text-blue-600 dark:text-blue-400">
            · {entry.scheduleType}
          </span>
        )}
      </div>
    </div>
  );
}

function DayGrid({
  day,
  rooms,
  eventId,
  timezone,
  hideEmpty,
}: {
  day: AgendaData["days"][number];
  rooms: AgendaData["rooms"];
  eventId: string;
  timezone: string;
  hideEmpty: boolean;
}) {
  // Filter rooms based on hideEmpty
  const usedRoomIds = getUsedRoomIds(day);
  const visibleRooms = hideEmpty
    ? rooms.filter((r) => usedRoomIds.has(r.id))
    : rooms;

  if (day.timeSlots.length === 0 || visibleRooms.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {hideEmpty && usedRoomIds.size === 0
          ? "No scheduled functions for this day."
          : "No scheduled functions for this day."}
      </p>
    );
  }

  // skipMap tracks how many more rows each room column should skip
  const skipMap = new Map<string, number>();
  for (const room of visibleRooms) {
    skipMap.set(room.id, 0);
  }

  type CellRender =
    | { type: "skip" }
    | { type: "empty" }
    | { type: "entries"; entries: AgendaEntry[]; rowspan: number };

  const rowData: Array<{ slotTime: Date; cells: CellRender[] }> = [];

  for (const slot of day.timeSlots) {
    const slotKey = slot.toISOString();
    const cells: CellRender[] = [];

    for (const room of visibleRooms) {
      const remaining = skipMap.get(room.id) ?? 0;
      if (remaining > 0) {
        skipMap.set(room.id, remaining - 1);
        cells.push({ type: "skip" });
        continue;
      }

      const entries = day.cells.get(room.id)?.get(slotKey) ?? [];

      if (entries.length === 0) {
        cells.push({ type: "empty" });
      } else {
        const maxSpan = Math.max(
          ...entries.map((e) => computeRowspan(e, day.timeSlots))
        );
        if (maxSpan > 1) {
          skipMap.set(room.id, maxSpan - 1);
        }
        cells.push({ type: "entries", entries, rowspan: maxSpan });
      }
    }

    rowData.push({ slotTime: slot, cells });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800">
            <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap w-24">
              Time
            </th>
            {visibleRooms.map((room) => (
              <th
                key={room.id}
                className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-medium text-gray-900 dark:text-white whitespace-nowrap"
              >
                {room.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowData.map(({ slotTime, cells }) => (
            <tr key={slotTime.toISOString()} className="h-14">
              <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap align-top font-medium">
                {formatTime(slotTime, timezone)}
              </td>
              {cells.map((cell, i) => {
                if (cell.type === "skip") return null;
                const room = visibleRooms[i];
                if (cell.type === "empty") {
                  return (
                    <td
                      key={room.id}
                      className="border border-gray-200 dark:border-gray-700 px-2 py-2 bg-white dark:bg-gray-900"
                    />
                  );
                }
                return (
                  <td
                    key={room.id}
                    rowSpan={cell.rowspan}
                    className="border border-gray-200 dark:border-gray-700 px-2 py-2 align-top bg-white dark:bg-gray-900"
                  >
                    {cell.entries.map((entry) => (
                      <EntryCard
                        key={entry.scheduleId}
                        entry={entry}
                        eventId={eventId}
                        timezone={timezone}
                      />
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgendaGrid({
  eventId,
  agendaData: serializedData,
  timezone,
  activeDate,
  hideEmpty,
}: AgendaGridProps) {
  const agendaData = deserializeAgendaData(serializedData);
  const { days, rooms, unscheduled } = agendaData;

  const resolvedDate = activeDate ?? days[0]?.dateKey ?? null;
  const activeDay = days.find((d) => d.dateKey === resolvedDate) ?? days[0];

  return (
    <div>
      {rooms.length === 0 && (
        <p className="mb-4 text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-2">
          No venue or rooms assigned to this event. Assign a venue to see the
          room-based agenda.
        </p>
      )}

      {days.length === 0 && rooms.length > 0 && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          No functions with both a room and schedule assigned yet.
        </p>
      )}

      {days.length > 1 && (
        <DateTabs
          eventId={eventId}
          days={days.map((d) => d.dateKey)}
          activeDate={resolvedDate!}
          timezone={timezone}
        />
      )}

      {days.length > 0 && (
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">
            {resolvedDate ? formatDateHeading(resolvedDate, timezone) : ""}
          </h2>
          {rooms.length > 0 && (
            <HideEmptyToggle eventId={eventId} hideEmpty={hideEmpty} />
          )}
        </div>
      )}

      {activeDay && (
        <DayGrid
          day={activeDay}
          rooms={rooms}
          eventId={eventId}
          timezone={timezone}
          hideEmpty={hideEmpty}
        />
      )}

      {unscheduled.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-medium text-gray-700 dark:text-gray-300 mb-3">
            Unscheduled Items ({unscheduled.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            These functions are missing a room assignment, a schedule, or both.
          </p>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {unscheduled.map((fn) => (
              <div
                key={fn.id}
                className="px-4 py-3 bg-white dark:bg-gray-900 flex items-center justify-between gap-4"
              >
                <div>
                  <Link
                    href={`/events/${eventId}/functions/${fn.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {fn.name}
                  </Link>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {fn.rooms.length === 0 && fn.schedules.length === 0
                      ? "No room, no schedule"
                      : fn.rooms.length === 0
                      ? "No room assigned"
                      : "No schedule"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
