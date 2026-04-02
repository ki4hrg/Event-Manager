"use client";

import { useFormStatus } from "react-dom";
import type { Function, Room, FunctionRoom, CustomOption, BreakoutGroup } from "@prisma/client";

type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
};

type FunctionFormProps = {
  fn?: FunctionWithRelations;
  rooms: Room[];
  eventId: string;
  functionTypes: CustomOption[];
  action: (formData: FormData) => Promise<void>;
  defaultType?: string;
  breakoutGroupId?: string;
  breakoutGroups?: BreakoutGroup[];
  timezone?: string;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Function" : "Create Function"}
    </button>
  );
}

export function FunctionForm({ fn, rooms, eventId, functionTypes, action, defaultType, breakoutGroupId, breakoutGroups, timezone }: FunctionFormProps) {
  const isEdit = !!fn;
  const selectedRoomIds = fn?.rooms.map((r) => r.roomId) || [];
  const isBreakoutType = defaultType === "BREAKOUT_BLOCK" || fn?.type === "BREAKOUT_BLOCK";
  const isBreakoutBlock = isBreakoutType && !isEdit; // creation only — shows time fields

  const tzAbbrev = timezone
    ? new Date()
        .toLocaleString("en-US", { timeZone: timezone, timeZoneName: "short" })
        .split(" ")
        .pop()
    : "local";

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {breakoutGroupId && !breakoutGroups && (
        <input type="hidden" name="breakoutGroupId" value={breakoutGroupId} />
      )}

      {/* Basic Info */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Basic Information
        </h2>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {isBreakoutType ? "Block Name *" : "Function Name *"}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={fn?.name}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isBreakoutType && breakoutGroups && (
            <div>
              <label
                htmlFor="breakoutGroupId"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Breakout Group
              </label>
              <select
                id="breakoutGroupId"
                name="breakoutGroupId"
                defaultValue={fn?.breakoutGroupId || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No group</option>
                {breakoutGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isBreakoutType ? (
            <input type="hidden" name="type" value="BREAKOUT_BLOCK" />
          ) : (
            <div>
              <label
                htmlFor="type"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Type
              </label>
              {functionTypes.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No function types defined.{" "}
                  <a href="/settings" className="text-blue-600 hover:underline">
                    Add types in Settings
                  </a>
                </p>
              ) : (
                <select
                  id="type"
                  name="type"
                  defaultValue={fn?.type || ""}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select type...</option>
                  {functionTypes.map((t) => (
                    <option key={t.id} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {!isBreakoutType && (
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
                rows={2}
                defaultValue={fn?.description || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Time (breakout block creation only) */}
      {isBreakoutBlock && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Time
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start ({tzAbbrev}) *
              </label>
              <input
                type="datetime-local"
                name="startTime"
                required
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End ({tzAbbrev}) *
              </label>
              <input
                type="datetime-local"
                name="endTime"
                required
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Room Assignment */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Room Assignment
        </h2>

        {rooms.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            No rooms available. Add rooms to the event&apos;s venue first.
          </p>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <label key={room.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="roomIds"
                  value={room.id}
                  defaultChecked={selectedRoomIds.includes(room.id)}
                  className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-900 dark:text-white">{room.name}</span>
                {room.capacity && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    (capacity: {room.capacity})
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Setup Notes (not shown for breakout blocks) */}
      {!isBreakoutType && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Setup Notes
          </h2>

          <textarea
            id="setupNotes"
            name="setupNotes"
            rows={3}
            placeholder="Table setup, seating arrangement, special requirements..."
            defaultValue={fn?.setupNotes || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Form Actions */}
      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <a
          href={isBreakoutType ? `/events/${eventId}/breakout-schedule` : `/events/${eventId}`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
