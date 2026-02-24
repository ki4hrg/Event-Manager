"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { PresentationSession, PresentationSessionRoom, Room } from "@prisma/client";
import type { RoomConflict } from "@/lib/conflicts";

type SessionWithRooms = PresentationSession & {
  rooms: (PresentationSessionRoom & { room: Room })[];
};

type SessionListProps = {
  sessions: SessionWithRooms[];
  rooms: Room[];
  presentationId: string;
  timezone: string;
  createSession: (formData: FormData) => Promise<{ conflicts: RoomConflict[] } | void>;
  updateSession: (
    sessionId: string,
    formData: FormData
  ) => Promise<{ conflicts: RoomConflict[] } | void>;
  deleteSession: (sessionId: string) => Promise<void>;
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

function ConflictWarning({ conflicts, timezone }: { conflicts: RoomConflict[]; timezone: string }) {
  if (conflicts.length === 0) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
      <div className="flex items-start gap-2">
        <svg
          className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Room Conflict Warning
          </p>
          <ul className="mt-1 text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside">
            {conflicts.map((conflict, i) => (
              <li key={i}>
                {conflict.roomName}:{" "}
                {conflict.conflictType === "function" ? "Function" : "Presentation"} &quot;
                {conflict.conflictName}&quot; ({formatter.format(conflict.startTime)} -{" "}
                {formatter.format(conflict.endTime)})
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
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

export function SessionList({
  sessions,
  rooms,
  presentationId,
  timezone,
  createSession,
  updateSession,
  deleteSession,
}: SessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [conflicts, setConflicts] = useState<RoomConflict[]>([]);

  const tzAbbrev = new Date()
    .toLocaleString("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    })
    .split(" ")
    .pop();

  const handleCreate = async (formData: FormData) => {
    const result = await createSession(formData);
    if (result && result.conflicts) {
      setConflicts(result.conflicts);
    } else {
      setConflicts([]);
      setShowAddForm(false);
    }
  };

  const handleUpdate = async (sessionId: string, formData: FormData) => {
    const result = await updateSession(sessionId, formData);
    if (result && result.conflicts) {
      setConflicts(result.conflicts);
    } else {
      setConflicts([]);
      setEditingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Scheduled Sessions
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Times shown in {tzAbbrev}</p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setConflicts([]);
          }}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Session
        </button>
      </div>

      {rooms.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          No rooms available. Add rooms to the event&apos;s venue to schedule sessions.
        </p>
      )}

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

            {rooms.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room(s)
                </label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {rooms.map((room) => (
                    <label key={room.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        name="roomIds"
                        value={room.id}
                        className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-white">{room.name}</span>
                      {room.capacity && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({room.capacity})
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

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

          {conflicts.length > 0 && <ConflictWarning conflicts={conflicts} timezone={timezone} />}

          <div className="mt-4 flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setConflicts([]);
              }}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sessions.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No sessions scheduled yet. Add a session to define when this presentation will occur.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === session.id ? (
                <form
                  action={(formData) => handleUpdate(session.id, formData)}
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
                        defaultValue={formatDateTimeForInput(session.startTime, timezone)}
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
                        defaultValue={formatDateTimeForInput(session.endTime, timezone)}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>

                  {rooms.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Room(s)
                      </label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {rooms.map((room) => (
                          <label key={room.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              name="roomIds"
                              value={room.id}
                              defaultChecked={session.rooms.some((r) => r.roomId === room.id)}
                              className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-900 dark:text-white">
                              {room.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      name="notes"
                      defaultValue={session.notes || ""}
                      placeholder="Notes"
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  {conflicts.length > 0 && (
                    <ConflictWarning conflicts={conflicts} timezone={timezone} />
                  )}

                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setConflicts([]);
                      }}
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
                      {formatDateTimeInTimezone(session.startTime, timezone)} –{" "}
                      {formatDateTimeInTimezone(session.endTime, timezone)}
                    </div>
                    {session.rooms.length > 0 && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {session.rooms.map((r) => r.room.name).join(", ")}
                      </div>
                    )}
                    {session.notes && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                        {session.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => {
                        setEditingId(session.id);
                        setConflicts([]);
                      }}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this session?")) {
                          await deleteSession(session.id);
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
    </div>
  );
}
