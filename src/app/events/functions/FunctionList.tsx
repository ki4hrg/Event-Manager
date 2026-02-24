"use client";

import Link from "next/link";
import type { Function, FunctionRoom, Room, FunctionSchedule, CustomOption } from "@prisma/client";

type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  schedules: FunctionSchedule[];
};

type FunctionListProps = {
  functions: FunctionWithRelations[];
  eventId: string;
  timezone: string;
  functionTypes: CustomOption[];
  duplicateFunction: (id: string) => Promise<void>;
  deleteFunction: (id: string) => Promise<void>;
};

const colorClasses: Record<string, string> = {
  gray: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  red: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
  orange: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
  yellow: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300",
  green: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  blue: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  purple: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  pink: "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300",
};

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateHeading(dateKey: string, timezone: string): string {
  // dateKey is YYYY-MM-DD in the event's timezone.
  // Use noon UTC so the date is unambiguous in any timezone when displayed.
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateKeyInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Get the earliest schedule date for a function
function getEarliestDate(fn: FunctionWithRelations): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((earliest, s) => {
    const start = new Date(s.startTime);
    return start < earliest ? start : earliest;
  }, new Date(fn.schedules[0].startTime));
}

// Group functions by date of earliest schedule (in the event's timezone)
function groupByDate(functions: FunctionWithRelations[], timezone: string): {
  dated: Map<string, FunctionWithRelations[]>;
  unscheduled: FunctionWithRelations[];
} {
  const dated = new Map<string, FunctionWithRelations[]>();
  const unscheduled: FunctionWithRelations[] = [];

  functions.forEach((fn) => {
    const earliest = getEarliestDate(fn);
    if (!earliest) {
      unscheduled.push(fn);
    } else {
      const dateKey = getDateKeyInTimezone(earliest, timezone);
      if (!dated.has(dateKey)) {
        dated.set(dateKey, []);
      }
      dated.get(dateKey)!.push(fn);
    }
  });

  // Sort each group by earliest time
  dated.forEach((fns) => {
    fns.sort((a, b) => {
      const aTime = getEarliestDate(a)?.getTime() || 0;
      const bTime = getEarliestDate(b)?.getTime() || 0;
      return aTime - bTime;
    });
  });

  return { dated, unscheduled };
}

export function FunctionList({ functions, eventId, timezone, functionTypes, duplicateFunction, deleteFunction }: FunctionListProps) {
  const { dated, unscheduled } = groupByDate(functions, timezone);

  // Create lookup maps for type labels and colors
  const typeLabels = new Map(functionTypes.map((t) => [t.value, t.label]));
  const typeColors = new Map(functionTypes.map((t) => [t.value, t.color || "gray"]));

  // Sort dates
  const sortedDates = Array.from(dated.keys()).sort();

  const renderFunction = (fn: FunctionWithRelations) => (
    <div
      key={fn.id}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/events/${eventId}/functions/${fn.id}`}
              className="text-blue-600 hover:underline font-medium truncate"
            >
              {fn.name}
            </Link>
            {fn.type && (
              <span
                className={`px-2 py-0.5 text-xs rounded ${
                  colorClasses[typeColors.get(fn.type) || "gray"] || colorClasses.gray
                }`}
              >
                {typeLabels.get(fn.type) || fn.type}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {fn.schedules.length > 0 ? (
              <span>
                {fn.schedules.length === 1
                  ? formatDateTime(fn.schedules[0].startTime) +
                    " – " +
                    formatDateTime(fn.schedules[0].endTime)
                  : `${fn.schedules.length} scheduled times`}
              </span>
            ) : (
              <span className="text-yellow-600 dark:text-yellow-400">No schedule</span>
            )}
            {fn.rooms.length > 0 && (
              <span className="ml-2">
                | {fn.rooms.map((r) => r.room.name).join(", ")}
              </span>
            )}
          </div>
          {fn.description && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 truncate">
              {fn.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={async () => {
              await duplicateFunction(fn.id);
            }}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            title="Duplicate"
          >
            Copy
          </button>
          <Link
            href={`/events/${eventId}/functions/${fn.id}`}
            className="text-blue-600 hover:underline text-sm"
          >
            Edit
          </Link>
          <button
            onClick={async () => {
              if (confirm("Delete this function?")) {
                await deleteFunction(fn.id);
              }
            }}
            className="text-red-600 hover:underline text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Functions ({functions.length})
        </h2>
        <Link
          href={`/events/${eventId}/functions/new`}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Function
        </Link>
      </div>

      {functions.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No functions yet.{" "}
          <Link
            href={`/events/${eventId}/functions/new`}
            className="text-blue-600 hover:underline"
          >
            Add your first function
          </Link>
        </p>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {formatDateHeading(dateKey, timezone)}
              </h3>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {dated.get(dateKey)!.map(renderFunction)}
                </div>
              </div>
            </div>
          ))}

          {unscheduled.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Unscheduled
              </h3>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {unscheduled.map(renderFunction)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
