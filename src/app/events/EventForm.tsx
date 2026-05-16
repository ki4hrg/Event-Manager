"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Event, Venue } from "@prisma/client";

type EventFormProps = {
  event?: Event;
  venues: Venue[];
  action: (formData: FormData) => Promise<void>;
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

export function EventForm({ event, venues, action }: EventFormProps) {
  const isEdit = !!event;
  const [editing, setEditing] = useState(!isEdit);
  const [daysLabel, setDaysLabel] = useState("");

  useEffect(() => {
    if (!event) return;
    const now = Date.now();
    const startDays = Math.ceil((new Date(event.startDate).getTime() - now) / 86_400_000);
    const endDays = Math.ceil((new Date(event.endDate).getTime() - now) / 86_400_000);
    let label: string;
    if (startDays > 0) label = `${startDays} days away`;
    else if (endDays < 0) label = `ended ${Math.abs(endDays)} days ago`;
    else label = "ongoing";
    startTransition(() => setDaysLabel(label));
  }, [event]);

  const formatDateForInput = (date: Date) => {
    return new Date(date).toISOString().split("T")[0];
  };

  const formatDateForDisplay = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const venueName = event?.venueId
    ? venues.find((v) => v.id === event.venueId)?.name || "—"
    : "—";

  const timezoneLabels: Record<string, string> = {
    "America/New_York": "Eastern Time",
    "America/Chicago": "Central Time",
    "America/Denver": "Mountain Time",
    "America/Los_Angeles": "Pacific Time",
    "America/Anchorage": "Alaska Time",
    "Pacific/Honolulu": "Hawaii Time",
    UTC: "UTC",
  };

  if (isEdit && !editing) {
    const dateRange = `${formatDateForDisplay(event.startDate)} – ${formatDateForDisplay(event.endDate)}`;

    return (
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {event.venueId && `${venueName} · `}
            {dateRange}
            <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">
              {daysLabel}
            </span>
          </p>
          {event.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {event.description}
            </p>
          )}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-950 shrink-0 ml-4"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className="space-y-6"
    >
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

      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        {isEdit ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        ) : (
          <Link
            href="/events"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
