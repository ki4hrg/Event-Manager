"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEventDate } from "@/lib/agendaUtils";

type EventItem = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  venues: { venue: { name: string } }[];
  series?: { id: string; name: string } | null;
};

type Props = {
  events: EventItem[];
  seriesOptions: { id: string; name: string }[];
  selectedSeries: string;
  canWrite: boolean;
};

// Primary venue, plus a count of the others: "Grand Hotel +1".
function venueSummary(event: EventItem): string {
  const [primary, ...rest] = event.venues;
  if (!primary) return "";
  return rest.length > 0 ? `${primary.venue.name} +${rest.length}` : primary.venue.name;
}

export function EventListClient({ events, seriesOptions, selectedSeries, canWrite }: Props) {
  const router = useRouter();

  // One "now" for both the count and the filter — two calls can straddle an
  // event's endDate and leave the checkbox on while the table renders empty.
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.endDate) >= now);
  // Default the filter off when nothing is upcoming — otherwise a user whose only
  // access is to past events lands on an empty table.
  const [hideCompleted, setHideCompleted] = useState(upcoming.length > 0);

  const filtered = hideCompleted ? upcoming : events;
  const completedCount = events.length - upcoming.length;

  function pushSeries(value: string) {
    router.push(value ? `/events?series=${encodeURIComponent(value)}` : "/events");
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {seriesOptions.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="series-filter"
              className="text-sm text-gray-600 dark:text-gray-400"
            >
              Series
            </label>
            <select
              id="series-filter"
              value={selectedSeries}
              onChange={(e) => pushSeries(e.target.value)}
              className="min-w-0 flex-1 sm:flex-none px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All series</option>
              {seriesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__blank__">No series</option>
            </select>
          </div>
        )}

        {completedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
            />
            Hide completed events ({completedCount})
          </label>
        )}
      </div>

      {events.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {selectedSeries ? (
              "No events in this series."
            ) : canWrite ? (
              <>
                No events yet.{" "}
                <Link
                  href="/events/new"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Create your first event
                </Link>
              </>
            ) : (
              "No events are shared with you yet."
            )}
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: one card per event; the table below takes over from sm up. */}
        <div className="sm:hidden bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {filtered.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
              No upcoming events. Uncheck the filter to see completed events.
            </p>
          ) : (
            filtered.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="block font-medium text-blue-600 dark:text-blue-400 break-words">
                  {event.name}
                </span>
                <span className="block text-sm text-gray-600 dark:text-gray-400">
                  {formatEventDate(event.startDate, event.timezone)} –{" "}
                  {formatEventDate(event.endDate, event.timezone)}
                </span>
                {(event.venues.length > 0 || event.series?.name) && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400 break-words">
                    {[venueSummary(event), event.series?.name].filter(Boolean).join(" · ")}
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
        <div className="hidden sm:block bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Dates
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Series
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Venue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400"
                  >
                    No upcoming events. Uncheck the filter to see completed events.
                  </td>
                </tr>
              ) : (
                filtered.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4">
                      <Link
                        href={`/events/${event.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {event.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatEventDate(event.startDate, event.timezone)} -{" "}
                      {formatEventDate(event.endDate, event.timezone)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {event.series?.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {venueSummary(event) || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
