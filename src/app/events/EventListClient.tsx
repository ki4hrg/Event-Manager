"use client";

import { useState } from "react";
import Link from "next/link";

type EventItem = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  venue?: { name: string } | null;
};

export function EventListClient({ events }: { events: EventItem[] }) {
  const [hideCompleted, setHideCompleted] = useState(true);

  const now = new Date();
  const filtered = hideCompleted
    ? events.filter((e) => new Date(e.endDate) >= now)
    : events;

  const completedCount = events.length - events.filter((e) => new Date(e.endDate) >= now).length;

  return (
    <div>
      {completedCount > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
            />
            Hide completed events ({completedCount})
          </label>
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
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
                Venue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  No upcoming events. Uncheck the filter to see completed events.
                </td>
              </tr>
            ) : (
              filtered.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/events/${event.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {event.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(event.startDate).toLocaleDateString()} -{" "}
                    {new Date(event.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {event.venue?.name || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
