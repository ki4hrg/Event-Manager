"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import type { PresentationSlot, Function as PrismaFunction, FunctionSchedule, Room, BreakoutGroup } from "@prisma/client";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { groupRoomsByGroup } from "@/lib/roomGroups";
import { PartyField, parsePartyValue, type ContactOptions } from "@/app/events/av-orders/party-field";
import { partyLabel } from "@/lib/partyLabel";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { resolveAdvancer } from "@/lib/presentationAdvancer";
import { useCanWrite } from "@/components/PermissionsProvider";

type RoomBasic = {
  id: string;
  name: string;
  group?: { id: string; name: string; sortOrder: number } | null;
};

type SessionBasic = {
  id: string;
  name: string;
  functionNumber: string | null;
  schedules: { startTime: Date; endTime: Date }[];
};

type BreakoutGroupFull = {
  id: string;
  name: string;
  rooms: RoomBasic[];
  sessions: SessionBasic[];
};

type SlotWithDetails = PresentationSlot & {
  function: PrismaFunction & {
    schedules: FunctionSchedule[];
    breakoutGroup: BreakoutGroup | null;
  };
  room: Room | null;
  advancerVendor: { id: string; name: string } | null;
  advancerContact: { id: string; firstName: string; lastName: string } | null;
};

type PresentationAdvancer = {
  advancerVendor: { id: string; name: string } | null;
  advancerContact: { id: string; firstName: string; lastName: string } | null;
};

type BreakoutSlotPanelProps = {
  slots: SlotWithDetails[];
  eventId: string;
  timezone: string;
  instanceCount: number;
  currentGroupId: string | null;
  groups: BreakoutGroupFull[];
  presentationAdvancer: PresentationAdvancer;
  advancerOptions: { vendorGroups: ResponsiblePartyOptions; contacts: ContactOptions };
  addSlot: (functionId: string, roomId: string | null) => Promise<void>;
  removeAll: () => Promise<void>;
  editSlot: (slotId: string, functionId: string, roomId: string | null) => Promise<{ success: boolean; error?: string }>;
  assignToGroup: (groupId: string) => Promise<void>;
  updateInstanceCount: (count: number) => Promise<void>;
  setSlotAdvancer: (slotId: string, vendorId: string | null, contactId: string | null) => Promise<void>;
  clearSlotAdvancer: (slotId: string) => Promise<void>;
};

function RoomOptions({ rooms }: { rooms: RoomBasic[] }) {
  const buckets = groupRoomsByGroup(rooms);
  const hasGroups = buckets.some((b) => b.named);
  if (!hasGroups) {
    return (
      <>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </>
    );
  }
  return (
    <>
      {buckets.map((bucket) => (
        <optgroup key={bucket.key} label={bucket.label}>
          {bucket.rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function formatSessionTime(
  schedules: { startTime: Date; endTime: Date }[],
  timezone: string
): string {
  if (schedules.length === 0) return "No time set";
  return new Date(schedules[0].startTime).toLocaleString("en-US", {
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
  eventId,
  timezone,
  instanceCount,
  currentGroupId,
  groups,
  presentationAdvancer,
  advancerOptions,
  addSlot,
  removeAll,
  editSlot,
  assignToGroup,
  updateInstanceCount,
  setSlotAdvancer,
  clearSlotAdvancer,
}: BreakoutSlotPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const canWrite = useCanWrite("PRESENTATIONS");
  const [editingCount, setEditingCount] = useState(false);
  const [countValue, setCountValue] = useState(String(instanceCount));
  const [addGroupId, setAddGroupId] = useState("");
  const [addSessionId, setAddSessionId] = useState("");
  const [addRoomId, setAddRoomId] = useState("");

  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editSessionId, setEditSessionId] = useState("");
  const [editRoomId, setEditRoomId] = useState("");
  const [editError, setEditError] = useState("");

  const [advancerSlotId, setAdvancerSlotId] = useState<string | null>(null);
  const [advancerValue, setAdvancerValue] = useState("");

  const [isPending, startTransition] = useTransition();

  const currentGroup = useMemo(
    () => groups.find((g) => g.id === currentGroupId) ?? null,
    [groups, currentGroupId]
  );

  const addGroup = useMemo(
    () => groups.find((g) => g.id === addGroupId) ?? null,
    [groups, addGroupId]
  );

  const assignedSessionIds = useMemo(
    () => new Set(slots.map((s) => s.functionId)),
    [slots]
  );

  // Sessions in the selected add-group that aren't already assigned
  const availableAddSessions = useMemo(
    () => (addGroup?.sessions ?? []).filter((s) => !assignedSessionIds.has(s.id)),
    [addGroup, assignedSessionIds]
  );

  // Rooms for selected add-group
  const addGroupRooms = addGroup?.rooms ?? [];

  // For editing a slot: sessions in the current group (including the slot's own session)
  function getEditSessions(slotFunctionId: string): SessionBasic[] {
    if (!currentGroup) return [];
    return currentGroup.sessions.filter(
      (s) => s.id === slotFunctionId || !assignedSessionIds.has(s.id)
    );
  }

  const resetAddForm = () => {
    setShowAddForm(false);
    setAddGroupId("");
    setAddSessionId("");
    setAddRoomId("");
  };

  const handleAddGroupChange = (groupId: string) => {
    setAddGroupId(groupId);
    setAddSessionId("");
    setAddRoomId("");
  };

  const handleAddSessionChange = (sessionId: string) => {
    setAddSessionId(sessionId);
    setAddRoomId("");
  };

  const handleAddSubmit = () => {
    if (!addGroupId) return;
    startTransition(async () => {
      if (currentGroupId !== addGroupId) {
        await assignToGroup(addGroupId);
      }
      if (addSessionId) {
        await addSlot(addSessionId, addRoomId || null);
      }
      resetAddForm();
    });
  };

  const handleRemoveAll = () => {
    if (!confirm("Remove all breakout assignments (group and sessions) for this presentation?")) return;
    startTransition(async () => {
      await removeAll();
    });
  };

  const startEdit = (slot: SlotWithDetails) => {
    setEditingSlotId(slot.id);
    setEditSessionId(slot.functionId);
    setEditRoomId(slot.roomId ?? "");
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingSlotId(null);
    setEditSessionId("");
    setEditRoomId("");
    setEditError("");
  };

  const handleEditSave = (slotId: string) => {
    if (!editSessionId) return;
    startTransition(async () => {
      const result = await editSlot(slotId, editSessionId, editRoomId || null);
      if (result.success) {
        cancelEdit();
      } else {
        setEditError(result.error ?? "Failed to update");
      }
    });
  };

  const startAdvancerEdit = (slot: SlotWithDetails) => {
    setAdvancerSlotId(slot.id);
    if (slot.advancerVendorId) setAdvancerValue(`vendor:${slot.advancerVendorId}`);
    else if (slot.advancerContactId) setAdvancerValue(`contact:${slot.advancerContactId}`);
    else setAdvancerValue("");
  };

  const cancelAdvancerEdit = () => {
    setAdvancerSlotId(null);
    setAdvancerValue("");
  };

  const saveAdvancer = (slotId: string) => {
    const { vendorId, contactId } = parsePartyValue(advancerValue);
    startTransition(async () => {
      await setSlotAdvancer(slotId, vendorId || null, contactId || null);
      cancelAdvancerEdit();
    });
  };

  const clearAdvancer = (slotId: string) => {
    startTransition(async () => {
      await clearSlotAdvancer(slotId);
      cancelAdvancerEdit();
    });
  };

  const placementBadge =
    slots.length >= instanceCount
      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
      : slots.length > 0
      ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400";

  const selectClass =
    "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Breakout Schedule
        </h2>
        <div className="flex items-center gap-2">
          {editingCount ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.max(1, parseInt(countValue) || 1);
                setCountValue(String(n));
                startTransition(async () => {
                  await updateInstanceCount(n);
                  setEditingCount(false);
                });
              }}
              className="flex items-center gap-1"
            >
              <input
                type="number"
                min={1}
                value={countValue}
                onChange={(e) => setCountValue(e.target.value)}
                autoFocus
                className="w-14 px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">instances</span>
              <button type="submit" disabled={isPending} className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">Save</button>
              <button type="button" onClick={() => { setEditingCount(false); setCountValue(String(instanceCount)); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
            </form>
          ) : (
            <>
              <span className={`text-xs px-2 py-0.5 rounded ${placementBadge}`}>
                {slots.length}/{instanceCount} placed
              </span>
              {canWrite && (
                <button
                  onClick={() => setEditingCount(true)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Current group + slots display */}
      {currentGroupId && (
        <div className="mb-4 space-y-2">
          {/* Group header row */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 break-words text-gray-500 dark:text-gray-400">
              Group: <span className="font-medium text-gray-900 dark:text-white">{currentGroup?.name ?? currentGroupId}</span>
            </span>
            {canWrite && (
              <button
                onClick={handleRemoveAll}
                disabled={isPending}
                className="text-red-600 hover:underline text-sm disabled:opacity-50"
              >
                Remove all
              </button>
            )}
          </div>

          {/* Slot rows */}
          {slots.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No sessions assigned</p>
          )}

          {slots.map((slot) =>
            editingSlotId === slot.id ? (
              <div key={slot.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Session</label>
                  <select
                    value={editSessionId}
                    onChange={(e) => { setEditSessionId(e.target.value); setEditRoomId(""); }}
                    className={selectClass}
                  >
                    <option value="">Select session...</option>
                    {getEditSessions(slot.functionId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatFunctionLabel({ name: s.name, functionNumber: s.functionNumber, breakoutGroup: currentGroup })}{s.schedules[0] ? ` — ${formatSessionTime(s.schedules, timezone)}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {editSessionId && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Room</label>
                    <select
                      value={editRoomId}
                      onChange={(e) => setEditRoomId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Unassigned</option>
                      <RoomOptions rooms={currentGroup?.rooms ?? []} />
                    </select>
                  </div>
                )}
                {editError && <p className="text-xs text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditSave(slot.id)}
                    disabled={!editSessionId || isPending}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isPending}
                    className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={slot.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 break-words">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      <Link
                        href={`/events/${eventId}/functions/${slot.functionId}`}
                        className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        {formatFunctionLabel(slot.function)}
                      </Link>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatSessionTime(slot.function.schedules, timezone)}
                    </div>
                    {slot.room && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Room: {slot.room.name}
                      </div>
                    )}
                    {(() => {
                      const resolved = resolveAdvancer(presentationAdvancer, slot);
                      const label = partyLabel(resolved.vendor, resolved.contact);
                      return (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Advancer: {label ?? <span className="italic">none</span>}
                          {resolved.source === "slot" && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400">(override)</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {canWrite && (
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                    <button
                      onClick={() => startEdit(slot)}
                      disabled={isPending}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => startAdvancerEdit(slot)}
                      disabled={isPending}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs disabled:opacity-50"
                    >
                      {slot.advancerVendorId || slot.advancerContactId ? "Edit advancer" : "Override advancer"}
                    </button>
                  </div>
                  )}
                </div>
                {advancerSlotId === slot.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                    <PartyField
                      value={advancerValue}
                      onChange={setAdvancerValue}
                      vendorGroups={advancerOptions.vendorGroups}
                      contacts={advancerOptions.contacts}
                      contactsLabel="Speakers"
                    />
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={() => saveAdvancer(slot.id)}
                        disabled={isPending}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save override
                      </button>
                      {(slot.advancerVendorId || slot.advancerContactId) && (
                        <button
                          onClick={() => clearAdvancer(slot.id)}
                          disabled={isPending}
                          className="px-3 py-1 text-red-600 hover:underline disabled:opacity-50"
                        >
                          Clear override
                        </button>
                      )}
                      <button
                        onClick={cancelAdvancerEdit}
                        disabled={isPending}
                        className="px-3 py-1 text-gray-600 dark:text-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Add form */}
      {!canWrite ? null : showAddForm ? (
        <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Breakout Group
            </label>
            {groups.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No breakout groups. Create groups on the{" "}
                <Link href={`/events/${eventId}/breakout-schedule`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  Breakout tab
                </Link>
                .
              </p>
            ) : (
              <select value={addGroupId} onChange={(e) => handleAddGroupChange(e.target.value)} className={selectClass}>
                <option value="">Select group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>

          {addGroupId && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Session (optional)
              </label>
              {availableAddSessions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No available sessions in this group.</p>
              ) : (
                <select value={addSessionId} onChange={(e) => handleAddSessionChange(e.target.value)} className={selectClass}>
                  <option value="">No session</option>
                  {availableAddSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatFunctionLabel({ name: s.name, functionNumber: s.functionNumber, breakoutGroup: addGroup })}{s.schedules[0] ? ` — ${formatSessionTime(s.schedules, timezone)}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {addSessionId && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Room
              </label>
              {addGroupRooms.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No rooms assigned to this group.</p>
              ) : (
                <select value={addRoomId} onChange={(e) => setAddRoomId(e.target.value)} className={selectClass}>
                  <option value="">Unassigned</option>
                  <RoomOptions rooms={addGroupRooms} />
                </select>
              )}
            </div>
          )}

          {groups.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={handleAddSubmit}
                disabled={!addGroupId || isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
              <button onClick={resetAddForm} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
                Cancel
              </button>
            </div>
          )}

          {groups.length === 0 && (
            <button onClick={resetAddForm} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
              Cancel
            </button>
          )}
        </div>
      ) : (
        /* Show "Add to Breakout" button only if not already in a group, or if more slots can be added */
        (!currentGroupId || slots.length < instanceCount) && (
          <button
            onClick={() => { setShowAddForm(true); setAddGroupId(currentGroupId ?? ""); }}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {currentGroupId ? "+ Add session" : "Add to Breakout"}
          </button>
        )
      )}
    </div>
  );
}
