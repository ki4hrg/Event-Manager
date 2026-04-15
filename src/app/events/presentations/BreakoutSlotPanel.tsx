"use client";

import { useState, useTransition, useMemo } from "react";
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

type BreakoutGroupBasic = { id: string; name: string };

type BreakoutSlotPanelProps = {
  slots: SlotWithDetails[];
  availableBlocks: AvailableBlock[];
  rooms: Room[];
  eventId: string;
  timezone: string;
  instanceCount: number;
  currentGroupId: string | null;
  groups: BreakoutGroupBasic[];
  addSlot: (functionId: string, roomId: string | null) => Promise<void>;
  removeSlot: (slotId: string) => Promise<void>;
  assignToGroup: (groupId: string) => Promise<void>;
  unassignFromGroup: () => Promise<void>;
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
  instanceCount,
  currentGroupId,
  groups,
  addSlot,
  removeSlot,
  assignToGroup,
  unassignFromGroup,
}: BreakoutSlotPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [step, setStep] = useState<"group" | "session">("group");
  const [selectedGroupId, setSelectedGroupId] = useState(currentGroupId ?? "");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isPending, startTransition] = useTransition();

  const blocksForGroup = useMemo(
    () => selectedGroupId
      ? availableBlocks.filter((b) => b.breakoutGroup?.id === selectedGroupId)
      : availableBlocks,
    [availableBlocks, selectedGroupId]
  );

  const currentGroup = useMemo(
    () => groups.find((g) => g.id === currentGroupId),
    [groups, currentGroupId]
  );

  const resetForm = () => {
    setShowAddForm(false);
    setStep("group");
    setSelectedGroupId(currentGroupId ?? "");
    setSelectedBlockId("");
    setSelectedRoomId("");
  };

  const handleGroupOnly = () => {
    if (!selectedGroupId) return;
    startTransition(async () => {
      await assignToGroup(selectedGroupId);
      resetForm();
    });
  };

  const handleNextToSession = () => {
    if (!selectedGroupId) return;
    setSelectedBlockId("");
    setSelectedRoomId("");
    setStep("session");
  };

  const handleAddWithSession = () => {
    if (!selectedBlockId) return;
    startTransition(async () => {
      // Assign to group first if not already in this group
      if (currentGroupId !== selectedGroupId) {
        await assignToGroup(selectedGroupId);
      }
      await addSlot(selectedBlockId, selectedRoomId || null);
      resetForm();
    });
  };

  const handleRemove = (slotId: string) => {
    if (!confirm("Remove this block assignment?")) return;
    startTransition(async () => {
      await removeSlot(slotId);
    });
  };

  const handleUnassignFromGroup = () => {
    if (!confirm("Remove this presentation from the breakout group?")) return;
    startTransition(async () => {
      await unassignFromGroup();
    });
  };

  // Derive placement status
  const placementBadge =
    slots.length >= instanceCount
      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
      : slots.length > 0
      ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400";

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Breakout Schedule
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded ${placementBadge}`}>
          {slots.length}/{instanceCount} placed
        </span>
      </div>

      {/* Group-only assignment (in group but no slots) */}
      {currentGroupId && slots.length === 0 && (
        <div className="flex items-center justify-between p-3 mb-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div>
            <div className="text-sm text-gray-900 dark:text-white">
              In group: <span className="font-medium">{currentGroup?.name ?? currentGroupId}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No session assigned</div>
          </div>
          <button
            onClick={handleUnassignFromGroup}
            disabled={isPending}
            className="text-red-600 hover:underline text-sm disabled:opacity-50 shrink-0 ml-3"
          >
            Remove
          </button>
        </div>
      )}

      {/* Existing slots */}
      {slots.length > 0 && (
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

      {/* Add form */}
      {showAddForm ? (
        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          {step === "group" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Breakout Group
                </label>
                {groups.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No breakout groups. Create groups on the{" "}
                    <Link
                      href={`/events/${eventId}/breakout-schedule`}
                      className="text-blue-600 hover:underline"
                    >
                      Breakout tab
                    </Link>
                    .
                  </p>
                ) : (
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Select group...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {groups.length > 0 && (
                <div className="flex gap-2 items-center">
                  <button
                    onClick={handleNextToSession}
                    disabled={!selectedGroupId || isPending}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Next: Select session
                  </button>
                  <button
                    onClick={handleGroupOnly}
                    disabled={!selectedGroupId || isPending}
                    className="px-3 py-1.5 text-blue-600 text-sm hover:underline disabled:opacity-50"
                  >
                    {isPending ? "Saving..." : "Add to group (no session)"}
                  </button>
                </div>
              )}
            </>
          )}

          {step === "session" && (
            <>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <button
                  onClick={() => setStep("group")}
                  className="text-blue-600 hover:underline"
                >
                  ← Back
                </button>
                <span>Group: <span className="font-medium text-gray-700 dark:text-gray-300">{groups.find((g) => g.id === selectedGroupId)?.name}</span></span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Session (optional)
                </label>
                {blocksForGroup.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No available sessions in this group.
                  </p>
                ) : (
                  <select
                    value={selectedBlockId}
                    onChange={(e) => setSelectedBlockId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Select session...</option>
                    {blocksForGroup.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.schedules[0] ? ` — ${formatBlockTime(b.schedules, timezone)}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedBlockId && (
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
              )}

              <div className="flex gap-2 items-center">
                {selectedBlockId && (
                  <button
                    onClick={handleAddWithSession}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isPending ? "Adding..." : "Add to session"}
                  </button>
                )}
                <button
                  onClick={handleGroupOnly}
                  disabled={isPending}
                  className="px-3 py-1.5 text-blue-600 text-sm hover:underline disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Add to group only"}
                </button>
              </div>
            </>
          )}

          <button
            onClick={resetForm}
            className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Add to Breakout
        </button>
      )}
    </div>
  );
}
