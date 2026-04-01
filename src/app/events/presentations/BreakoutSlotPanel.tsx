"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type {
  PresentationSlot,
  Function as PrismaFunction,
  FunctionSchedule,
  Room,
  BreakoutGroup,
} from "@prisma/client";

type SlotWithDetails = PresentationSlot & {
  function: PrismaFunction & {
    schedules: FunctionSchedule[];
    breakoutGroup: BreakoutGroup | null;
  };
  room: Room | null;
};

type AvailableBlock = PrismaFunction & {
  schedules: FunctionSchedule[];
  breakoutGroup: BreakoutGroup | null;
};

type BreakoutSlotPanelProps = {
  slots: SlotWithDetails[];
  availableBlocks: AvailableBlock[];
  rooms: Room[];
  eventId: string;
  timezone: string;
  groupName: string | null;
  instanceCount: number;
  addSlot: (functionId: string, roomId: string | null) => Promise<void>;
  removeSlot: (slotId: string) => Promise<void>;
};

function formatBlockTime(
  schedules: { startTime: Date; endTime: Date }[],
  timezone: string
): string {
  if (schedules.length === 0) return "No time set";
  const s = schedules[0];
  return new Date(s.startTime).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BreakoutSlotPanel({
  slots,
  availableBlocks,
  rooms,
  eventId,
  timezone,
  groupName,
  instanceCount,
  addSlot,
  removeSlot,
}: BreakoutSlotPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!selectedBlockId) return;
    startTransition(async () => {
      await addSlot(selectedBlockId, selectedRoomId || null);
      setShowAddForm(false);
      setSelectedBlockId("");
      setSelectedRoomId("");
    });
  };

  const handleRemove = (slotId: string) => {
    if (!confirm("Remove this block assignment?")) return;
    startTransition(async () => {
      await removeSlot(slotId);
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Breakout Schedule
        </h2>
        <div className="flex items-center gap-2">
          {groupName && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
              {groupName}
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              slots.length >= instanceCount
                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                : slots.length > 0
                ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            }`}
          >
            {slots.length}/{instanceCount} placed
          </span>
        </div>
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Not assigned to any breakout block.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  <Link
                    href={`/events/${eventId}/functions/${slot.functionId}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {slot.function.name}
                  </Link>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatBlockTime(slot.function.schedules, timezone)}
                  {slot.function.breakoutGroup && (
                    <span className="ml-1">
                      · {slot.function.breakoutGroup.name}
                    </span>
                  )}
                </div>
                {slot.room && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Room: {slot.room.name}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemove(slot.id)}
                disabled={isPending}
                className="text-red-600 hover:underline text-sm disabled:opacity-50 shrink-0 ml-3"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          {availableBlocks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No available breakout blocks. Create blocks on the{" "}
              <Link
                href={`/events/${eventId}/breakout-schedule`}
                className="text-blue-600 hover:underline"
              >
                Breakout tab
              </Link>
              .
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Block
                </label>
                <select
                  value={selectedBlockId}
                  onChange={(e) => setSelectedBlockId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Select block...</option>
                  {availableBlocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.schedules[0]
                        ? ` — ${formatBlockTime(b.schedules, timezone)}`
                        : ""}
                      {b.breakoutGroup ? ` (${b.breakoutGroup.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room (optional)
                </label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Unassigned</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex gap-2">
            {availableBlocks.length > 0 && (
              <button
                onClick={handleAdd}
                disabled={!selectedBlockId || isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Adding..." : "Add"}
              </button>
            )}
            <button
              onClick={() => {
                setShowAddForm(false);
                setSelectedBlockId("");
                setSelectedRoomId("");
              }}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Add to Block
        </button>
      )}
    </div>
  );
}
