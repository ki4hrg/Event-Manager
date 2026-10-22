"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Function, Room, FunctionRoom, CustomOption, BreakoutGroup } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { groupRoomsByGroup } from "@/lib/roomGroups";
import { useCanWrite } from "@/components/PermissionsProvider";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { syncRangeEnd } from "@/lib/dateRange";

type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
};

type RoomWithGroup = Room & {
  group?: { id: string; name: string; sortOrder: number } | null;
  venue?: { id: string; name: string; rank?: number };
};

type FunctionFormProps = {
  fn?: FunctionWithRelations;
  rooms: RoomWithGroup[];
  eventId: string;
  functionTypes: CustomOption[];
  action: (formData: FormData) => Promise<void>;
  defaultType?: string;
  breakoutGroupId?: string;
  breakoutGroups?: BreakoutGroup[];
  timezone?: string;
  noCard?: boolean;
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


function RoomSelector({ rooms, selectedRoomIds, noCard = false }: { rooms: RoomWithGroup[]; selectedRoomIds: string[]; noCard?: boolean }) {
  const [roomFilter, setRoomFilter] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedRoomIds));
  const SHOW_FILTER_THRESHOLD = 8;
  const showFilter = rooms.length > SHOW_FILTER_THRESHOLD;

  const filteredRooms = showFilter && roomFilter
    ? rooms.filter((r) =>
        `${r.name} ${r.venue?.name ?? ""}`.toLowerCase().includes(roomFilter.toLowerCase()),
      )
    : rooms;

  const groupedRooms = useMemo(() => groupRoomsByGroup(filteredRooms), [filteredRooms]);
  const hasGroups = groupedRooms.some((g) => g.named);

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";
  const dividerClass = noCard ? "border-t border-gray-200 dark:border-gray-700 mt-0 pt-4" : "";

  function toggleRoom(roomId: string, isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(roomId);
      else next.delete(roomId);
      return next;
    });
  }

  function setGroupChecked(groupRoomIds: string[], isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of groupRoomIds) {
        if (isChecked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  if (rooms.length === 0) {
    return (
      <div className={noCard ? dividerClass : cardClass}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Room Assignment
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          No rooms available. Add rooms to the event&apos;s venue first.
        </p>
      </div>
    );
  }

  return (
    <div className={noCard ? dividerClass : cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Room Assignment
      </h2>
      {showFilter && (
        <input
          type="text"
          placeholder="Filter rooms..."
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          className="mb-3 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      <div className={`space-y-4 ${rooms.length > SHOW_FILTER_THRESHOLD ? "max-h-64 overflow-y-auto" : ""}`}>
        {Array.from(checked)
          .filter((id) => !filteredRooms.some((r) => r.id === id))
          .map((id) => (
            <input key={`hidden-${id}`} type="hidden" name="roomIds" value={id} />
          ))}
        {groupedRooms.map((bucket) => {
          const bucketIds = bucket.rooms.map((r) => r.id);
          const allSelected = bucketIds.length > 0 && bucketIds.every((id) => checked.has(id));
          const someSelected = bucketIds.some((id) => checked.has(id));
          const showHeader = hasGroups;
          return (
            <div key={bucket.key}>
              {showHeader && (
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {bucket.label}
                  </h3>
                  {bucket.rooms.length > 1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setGroupChecked(bucketIds, !allSelected)}
                        className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        disabled={allSelected && !someSelected}
                      >
                        {allSelected ? "Clear all" : "Select all"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {bucket.rooms.map((room) => (
                  <label key={room.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="roomIds"
                      value={room.id}
                      checked={checked.has(room.id)}
                      onChange={(e) => toggleRoom(room.id, e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
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
            </div>
          );
        })}
        {showFilter && roomFilter && filteredRooms.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No rooms match &quot;{roomFilter}&quot;</p>
        )}
      </div>
    </div>
  );
}

export function FunctionForm({ fn, rooms, eventId, functionTypes, action, defaultType, breakoutGroupId, breakoutGroups, timezone, noCard = false }: FunctionFormProps) {
  const isEdit = !!fn;
  // Read-only users get the detail view with no way back into edit mode.
  const canWrite = useCanWrite("FUNCTIONS");
  const [editing, setEditing] = useState(!isEdit);
  const selectedRoomIds = fn?.rooms.map((r) => r.roomId) || [];
  const isBreakoutType = defaultType === "BREAKOUT_BLOCK" || fn?.type === "BREAKOUT_BLOCK";
  const isBreakoutBlock = isBreakoutType && !isEdit; // creation only — shows time fields

  const tzAbbrev = timezone
    ? new Date()
        .toLocaleString("en-US", { timeZone: timezone, timeZoneName: "short" })
        .split(" ")
        .pop()
    : "local";

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";
  const dividerClass = "border-t border-gray-200 dark:border-gray-700 pt-4";

  // Read-only view for existing functions
  if (isEdit && (!editing || !canWrite)) {
    const typeLabel = resolveOptionLabel(fn.type, functionTypes) || "—";
    const roomNames = fn.rooms.length > 0
      ? fn.rooms.map((r) => r.room.name).join(", ")
      : fn.offSiteLocation
        ? `Off-site: ${fn.offSiteLocation}`
        : "—";
    const groupName = isBreakoutType && breakoutGroups
      ? breakoutGroups.find((g) => g.id === fn.breakoutGroupId)?.name || "No group"
      : null;

    return (
      <div className={noCard ? "" : "space-y-6 max-w-2xl"}>
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Basic Information
            </h2>
            {canWrite && (
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                Edit
              </button>
            )}
          </div>
          <dl className="space-y-4">
            <ReadOnlyField label={isBreakoutType ? "Block Name" : "Function Name"} value={fn.name} />
            {groupName !== null && <ReadOnlyField label="Breakout Group" value={groupName} />}
            {!isBreakoutType && <ReadOnlyField label="Type" value={typeLabel} />}
            {!isBreakoutType && <ReadOnlyField label="Description" value={fn.description} />}
          </dl>
        </div>

        <div className={noCard ? `${dividerClass} mt-4` : "bg-white dark:bg-gray-800 shadow rounded-lg p-6"}>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Room Assignment
          </h2>
          <p className="text-sm text-gray-900 dark:text-white">{roomNames}</p>
        </div>

        {!isBreakoutType && (
          <div className={noCard ? `${dividerClass} mt-4` : "bg-white dark:bg-gray-800 shadow rounded-lg p-6"}>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Notes
            </h2>
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
              {fn.notes || "—"}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className={noCard ? "space-y-0" : "space-y-6 max-w-2xl"}
    >
      {breakoutGroupId && !breakoutGroups && (
        <input type="hidden" name="breakoutGroupId" value={breakoutGroupId} />
      )}

      {/* Basic Info */}
      <div className={cardClass}>
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
                  <a href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">
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
                    <option key={t.id} value={t.label}>
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
                onChange={(e) => syncRangeEnd(e.currentTarget, "endTime", { keepDuration: true, defaultMinutes: 60 })}
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
      <RoomSelector rooms={rooms} selectedRoomIds={selectedRoomIds} noCard={noCard} />

      {/* Off-site Location */}
      {!isBreakoutType && (
        <div className={noCard ? dividerClass : "bg-white dark:bg-gray-800 shadow rounded-lg p-6"}>
          <label htmlFor="offSiteLocation" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Off-site Location
          </label>
          <input
            id="offSiteLocation"
            name="offSiteLocation"
            type="text"
            placeholder="e.g. The Capital Grille"
            defaultValue={fn?.offSiteLocation || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use if this function takes place outside the venue</p>
        </div>
      )}

      {/* Notes (not shown for breakout blocks) */}
      {!isBreakoutType && (
        <div className={noCard ? `${dividerClass} mt-4` : "bg-white dark:bg-gray-800 shadow rounded-lg p-6"}>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Notes
          </h2>

          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Table setup, seating arrangement, special requirements..."
            defaultValue={fn?.notes || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Form Actions */}
      <div className={`flex gap-4${noCard ? " mt-4" : ""}`}>
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
          <a
            href={isBreakoutType ? `/events/${eventId}/breakout-schedule` : `/events/${eventId}`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
