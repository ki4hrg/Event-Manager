"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { Function, FunctionRoom, FunctionSchedule, Room } from "@prisma/client";

type FunctionWithDetails = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  schedules: FunctionSchedule[];
};

type SchedulePanelProps = {
  function: FunctionWithDetails | null;
  rooms: Room[];
  presentationId: string;
  eventId: string;
  timezone: string;
  createFunction: () => Promise<void>;
  addSchedule: (formData: FormData) => Promise<void>;
  updateSchedule: (scheduleId: string, formData: FormData) => Promise<void>;
  deleteSchedule: (scheduleId: string) => Promise<void>;
  updateRooms: (roomIds: string[]) => Promise<void>;
  unlinkFunction: (deleteFunction: boolean) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

function formatDateTimeInTimezone(date: Date, timezone: string): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTimeForInput(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(date));
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function SchedulePanel({
  function: fn,
  rooms,
  presentationId,
  eventId,
  timezone,
  createFunction,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  updateRooms,
  unlinkFunction,
}: SchedulePanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRoomEditor, setShowRoomEditor] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const tzAbbrev = new Date()
    .toLocaleString("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    })
    .split(" ")
    .pop();

  const handleCreate = async (formData: FormData) => {
    await addSchedule(formData);
    setShowAddForm(false);
  };

  const handleUpdate = async (scheduleId: string, formData: FormData) => {
    await updateSchedule(scheduleId, formData);
    setEditingId(null);
  };

  const handleCreateFunction = async () => {
    setIsCreating(true);
    try {
      await createFunction();
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoomUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedRoomIds = formData.getAll("roomIds") as string[];
    await updateRooms(selectedRoomIds);
    setShowRoomEditor(false);
  };

  // Not linked to a function yet
  if (!fn) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Schedule
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            This presentation is not scheduled yet.
          </p>
          <button
            onClick={handleCreateFunction}
            disabled={isCreating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Schedule This Presentation"}
          </button>
        </div>
      </div>
    );
  }

  const schedules = fn.schedules;
  const assignedRooms = fn.rooms.map((r) => r.room);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Schedule
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Times shown in {tzAbbrev}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Time Slot
        </button>
      </div>

      {/* Room Assignment */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Room{assignedRooms.length !== 1 ? "s" : ""}:
            </span>{" "}
            <span className="text-sm text-gray-900 dark:text-white">
              {assignedRooms.length > 0
                ? assignedRooms.map((r) => r.name).join(", ")
                : "No room assigned"}
            </span>
          </div>
          <button
            onClick={() => setShowRoomEditor(!showRoomEditor)}
            className="text-blue-600 hover:underline text-sm"
          >
            {showRoomEditor ? "Cancel" : "Edit"}
          </button>
        </div>

        {showRoomEditor && (
          <form onSubmit={handleRoomUpdate} className="mt-3">
            {rooms.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No rooms available. Add rooms to the event&apos;s venue first.
              </p>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {rooms.map((room) => (
                  <label key={room.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="roomIds"
                      value={room.id}
                      defaultChecked={assignedRooms.some((r) => r.id === room.id)}
                      className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {room.name}
                    </span>
                    {room.capacity && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({room.capacity})
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowRoomEditor(false)}
                className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Add Schedule Form */}
      {showAddForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start ({tzAbbrev}) *
                </label>
                <input
                  type="datetime-local"
                  name="startTime"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End ({tzAbbrev}) *
                </label>
                <input
                  type="datetime-local"
                  name="endTime"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Optional notes..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Schedule List */}
      {schedules.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No time slots scheduled yet. Add a time slot to define when this presentation will occur.
        </p>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === schedule.id ? (
                <form
                  action={(formData) => handleUpdate(schedule.id, formData)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Start ({tzAbbrev})
                      </label>
                      <input
                        type="datetime-local"
                        name="startTime"
                        required
                        defaultValue={formatDateTimeForInput(schedule.startTime, timezone)}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End ({tzAbbrev})
                      </label>
                      <input
                        type="datetime-local"
                        name="endTime"
                        required
                        defaultValue={formatDateTimeForInput(schedule.endTime, timezone)}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      name="notes"
                      defaultValue={schedule.notes || ""}
                      placeholder="Notes"
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {formatDateTimeInTimezone(schedule.startTime, timezone)} –{" "}
                      {formatDateTimeInTimezone(schedule.endTime, timezone)}
                    </div>
                    {schedule.notes && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                        {schedule.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => setEditingId(schedule.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this time slot?")) {
                          await deleteSchedule(schedule.id);
                        }
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Function Link Info */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Linked to{" "}
            <Link
              href={`/events/${eventId}/functions/${fn.id}`}
              className="text-blue-600 hover:underline"
            >
              Function: {fn.name}
            </Link>
          </span>
          <button
            onClick={async () => {
              const shouldDelete = confirm(
                "Unlink this presentation from its function?\n\nClick OK to unlink (keeps the function)\nOr Cancel and use the function page to delete it entirely."
              );
              if (shouldDelete !== null) {
                await unlinkFunction(false);
              }
            }}
            className="text-red-600 hover:underline text-sm"
          >
            Unlink
          </button>
        </div>
      </div>
    </div>
  );
}
