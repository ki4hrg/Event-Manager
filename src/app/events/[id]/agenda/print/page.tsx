import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getFunctionsWithPresentations } from "@/app/events/functions/actions";
import { toTitleCase } from "@/lib/optionUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agenda (print)" };

function formatTime(date: Date, timezone: string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function formatDateHeading(dateKey: string, timezone: string): string {
  // dateKey is "YYYY-MM-DD"; parse at noon UTC to avoid timezone boundary issues
  return new Date(dateKey + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AgendaPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id: eventId } = await params;
  const { date: filterDate } = await searchParams;

  const [event, functions] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    getFunctionsWithPresentations(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const timezone = event.timezone || "America/Chicago";

  // Build per-day entries: { dateKey → entries sorted by start time }
  type AgendaEntry = {
    functionId: string;
    name: string;
    type: string;
    rooms: string[];
    startTime: Date;
    endTime: Date | null;
    scheduleType: string | null;
    notes: string | null;
  };

  const dayMap = new Map<string, AgendaEntry[]>();

  for (const fn of functions) {
    for (const schedule of fn.schedules) {
      if (!schedule.startTime) continue;
      const dateKey = getDateKey(schedule.startTime, timezone);

      if (filterDate && dateKey !== filterDate) continue;

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, []);
      }
      dayMap.get(dateKey)!.push({
        functionId: fn.id,
        name: formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name),
        type: fn.type ?? "",
        rooms: fn.rooms.map((fr) => fr.room.name),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        scheduleType: schedule.type,
        notes: schedule.notes,
      });
    }
  }

  // Sort days chronologically, sort entries within each day by start time
  const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [, entries] of sortedDays) {
    entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title={filterDate ? formatDateHeading(filterDate, timezone) : "Agenda"}
        backHref={`/events/${eventId}/agenda`}
      />

      {sortedDays.length === 0 && (
        <p className="text-gray-500">No scheduled functions found.</p>
      )}

      {sortedDays.map(([dateKey, entries], dayIndex) => (
        <div
          key={dateKey}
          className={dayIndex < sortedDays.length - 1 ? "mb-12 print:break-after-page" : ""}
        >
          {!filterDate && (
            <h2 className="text-lg font-semibold text-gray-800 print:text-black mb-4 pb-1 border-b border-gray-300">
              {formatDateHeading(dateKey, timezone)}
            </h2>
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-2 pr-4 font-medium w-36">Time</th>
                <th className="pb-2 pr-4 font-medium">Function</th>
                <th className="pb-2 pr-4 font-medium w-28">Type</th>
                <th className="pb-2 font-medium">Room(s)</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={`${entry.functionId}-${entry.startTime.toISOString()}`}
                  className="border-t border-gray-100 print:border-gray-300"
                >
                  <td className="py-2 pr-4 text-gray-700 print:text-black align-top whitespace-nowrap">
                    {formatTime(entry.startTime, timezone)}
                    {entry.endTime && (
                      <>
                        <br />
                        <span className="text-gray-400 print:text-gray-500 text-xs">
                          – {formatTime(entry.endTime, timezone)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-900 print:text-black align-top font-medium">
                    {entry.name}
                    {entry.notes && (
                      <p className="text-xs text-gray-500 print:text-gray-600 font-normal mt-0.5">{entry.notes}</p>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-600 print:text-gray-700 align-top text-xs">
                    {entry.scheduleType ? toTitleCase(entry.scheduleType) : "—"}
                  </td>
                  <td className="py-2 text-gray-600 print:text-gray-700 align-top">
                    {entry.rooms.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
