"use client";

import Link from "next/link";
import type { Function, FunctionRoom, Room, CustomOption } from "@prisma/client";

type FunctionWithRooms = Function & {
  rooms: (FunctionRoom & { room: Room })[];
};

type FunctionListProps = {
  functions: FunctionWithRooms[];
  eventId: string;
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

function formatTime(date: Date): string {
  const d = new Date(date);
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Group functions by date
function groupByDate(functions: FunctionWithRooms[]): Map<string, FunctionWithRooms[]> {
  const groups = new Map<string, FunctionWithRooms[]>();

  functions.forEach((fn) => {
    const dateKey = new Date(fn.date).toISOString().split("T")[0];
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(fn);
  });

  return groups;
}

export function FunctionList({ functions, eventId, functionTypes, duplicateFunction, deleteFunction }: FunctionListProps) {
  const groupedFunctions = groupByDate(functions);

  // Create lookup maps for type labels and colors
  const typeLabels = new Map(functionTypes.map((t) => [t.value, t.label]));
  const typeColors = new Map(functionTypes.map((t) => [t.value, t.color || "gray"]));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Schedule ({functions.length} {functions.length === 1 ? "function" : "functions"})
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
          No functions scheduled yet.{" "}
          <Link
            href={`/events/${eventId}/functions/new`}
            className="text-blue-600 hover:underline"
          >
            Add your first function
          </Link>
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedFunctions.entries()).map(([dateKey, dateFunctions]) => (
            <div key={dateKey}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {formatDate(new Date(dateKey))}
              </h3>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {dateFunctions.map((fn) => (
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
                            {formatTime(fn.startTime)} - {formatTime(fn.endTime)}
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
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
