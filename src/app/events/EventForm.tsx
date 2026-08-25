"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { Event, Venue } from "@prisma/client";
import { btnSecondary } from "@/lib/buttonStyles";

type EventFormProps = {
  event?: Event;
  venues: Venue[];
  series: { id: string; name: string }[];
  action: (formData: FormData) => Promise<void>;
  cancelHref?: string;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Event" : "Create Event"}
    </button>
  );
}

export function EventForm({ event, venues, series, action, cancelHref }: EventFormProps) {
  const isEdit = !!event;
  const formatDateForInput = (date: Date) => {
    return new Date(date).toISOString().split("T")[0];
  };

  return (
    <form action={action} className="space-y-6">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Event Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          defaultValue={event?.name}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={event?.description || ""}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="startDate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Start Date *
          </label>
          <input
            type="date"
            id="startDate"
            name="startDate"
            required
            defaultValue={event ? formatDateForInput(event.startDate) : ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="endDate"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            End Date *
          </label>
          <input
            type="date"
            id="endDate"
            name="endDate"
            required
            defaultValue={event ? formatDateForInput(event.endDate) : ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="timezone"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={event?.timezone || "America/Chicago"}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="America/New_York">Eastern Time</option>
          <option value="America/Chicago">Central Time</option>
          <option value="America/Denver">Mountain Time</option>
          <option value="America/Los_Angeles">Pacific Time</option>
          <option value="America/Anchorage">Alaska Time</option>
          <option value="Pacific/Honolulu">Hawaii Time</option>
          <option value="UTC">UTC</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="venueId"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Venue
        </label>
        <select
          id="venueId"
          name="venueId"
          defaultValue={event?.venueId || ""}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No venue selected</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="seriesId"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Series
          </label>
          <Link
            href="/events/series"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Manage series
          </Link>
        </div>
        <select
          id="seriesId"
          name="seriesId"
          defaultValue={event?.seriesId || ""}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No series</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <Link href={cancelHref ?? "/events"} className={btnSecondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
