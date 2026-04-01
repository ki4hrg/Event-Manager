"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type {
  Function as PrismaFunction,
  FunctionRoom,
  FunctionSchedule,
  PresentationSlot,
  Presentation,
  PresentationTrack,
  PresentationContact,
  Contact,
  Room,
  BreakoutGroup,
  BreakoutGroupRoom,
  BreakoutSessionRoomOverride,
} from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────────

type SlotData = PresentationSlot & {
  presentation: Presentation & {
    speakers: (PresentationContact & { contact: Contact })[];
  };
  room: Room | null;
};

type SessionFunction = PrismaFunction & {
  schedules: FunctionSchedule[];
  rooms: (FunctionRoom & { room: Room })[];
  sessionRoomOverrides: BreakoutSessionRoomOverride[];
  presentationSlots: SlotData[];
};

type GroupPresentation = Presentation & {
  slots: PresentationSlot[];
  track: PresentationTrack | null;
  speakers: (PresentationContact & { contact: Contact })[];
};

type GroupData = BreakoutGroup & {
  rooms: (BreakoutGroupRoom & { room: Room })[];
  functions: SessionFunction[];
  presentations: GroupPresentation[];
};

type BreakoutGridProps = {
  eventId: string;
  groups: GroupData[];
  ungroupedBlocks: SessionFunction[];
  venueRooms: Room[];
  timezone: string;
  createGroup: (formData: FormData) => Promise<void>;
  updateGroup: (groupId: string, formData: FormData) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  addRoomToGroup: (groupId: string, roomId: string) => Promise<void>;
  removeRoomFromGroup: (groupId: string, roomId: string) => Promise<void>;
  setSessionRoomOverride: (functionId: string, roomId: string, type: "exclude" | "include") => Promise<void>;
  removeSessionRoomOverride: (functionId: string, roomId: string) => Promise<void>;
  createSession: (groupId: string, formData: FormData) => Promise<void>;
  updateSession: (functionId: string, formData: FormData) => Promise<void>;
  deleteSession: (functionId: string) => Promise<void>;
  assignPresentation: (presentationId: string, functionId: string, roomId: string | null) => Promise<{ success: boolean; error?: string }>;
  moveSlot: (slotId: string, newFunctionId: string, newRoomId: string | null) => Promise<{ success: boolean; error?: string }>;
  removeSlot: (slotId: string) => Promise<void>;
  createGroupPresentation: (groupId: string, formData: FormData) => Promise<void>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSessionTime(
  schedules: { startTime: Date; endTime: Date }[],
  timezone: string
): string {
  if (schedules.length === 0) return "No time set";
  const s = schedules[0];
  const start = new Date(s.startTime).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(s.endTime).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${start} – ${end}`;
}

function formatSessionDate(
  schedules: { startTime: Date }[],
  timezone: string
): string {
  if (schedules.length === 0) return "";
  return new Date(schedules[0].startTime).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTimeLocal(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const formatted = formatter.format(new Date(date));
  return formatted.replace(", ", "T").replace(/\//g, "-");
}

function getEffectiveRooms(
  session: SessionFunction,
  groupRooms: (BreakoutGroupRoom & { room: Room })[]
): Room[] {
  const excludedIds = new Set(
    session.sessionRoomOverrides.filter((o) => o.type === "exclude").map((o) => o.roomId)
  );
  const includedOverrides = session.sessionRoomOverrides.filter((o) => o.type === "include");

  // Start with group rooms minus exclusions
  const rooms = groupRooms
    .filter((gr) => !excludedIds.has(gr.roomId))
    .map((gr) => gr.room);

  // Add session-specific includes (need to get room data from the override)
  // Since overrides don't include room relation in our current query, we use session.rooms for includes
  for (const override of includedOverrides) {
    if (!rooms.some((r) => r.id === override.roomId)) {
      // Find the room from the session's FunctionRoom relation or fallback
      const fr = session.rooms.find((fr) => fr.roomId === override.roomId);
      if (fr) rooms.push(fr.room);
    }
  }

  return rooms;
}

// ── Room Manager ───────────────────────────────────────────────────────────────

function GroupRoomManager({
  group,
  venueRooms,
  addRoom,
  removeRoom,
}: {
  group: GroupData;
  venueRooms: Room[];
  addRoom: (groupId: string, roomId: string) => Promise<void>;
  removeRoom: (groupId: string, roomId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const assignedRoomIds = new Set(group.rooms.map((r) => r.roomId));
  const availableRooms = venueRooms.filter((r) => !assignedRoomIds.has(r.id));

  return (
    <div className="mb-4">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Rooms
      </h4>
      <div className="flex flex-wrap gap-2 mb-2">
        {group.rooms.map((gr) => (
          <span
            key={gr.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300"
          >
            {gr.room.name}
            <button
              onClick={() => startTransition(() => removeRoom(group.id, gr.roomId))}
              disabled={isPending}
              className="text-gray-400 hover:text-red-500 ml-1 disabled:opacity-50"
              title="Remove room"
            >
              &times;
            </button>
          </span>
        ))}
        {group.rooms.length === 0 && (
          <span className="text-sm text-gray-400 dark:text-gray-500 italic">No rooms assigned</span>
        )}
      </div>
      {availableRooms.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              startTransition(() => addRoom(group.id, e.target.value));
            }
          }}
          disabled={isPending}
          className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
        >
          <option value="">+ Add room...</option>
          {availableRooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── Session Manager ────────────────────────────────────────────────────────────

function SessionManager({
  group,
  timezone,
  createSession,
  deleteSession,
}: {
  group: GroupData;
  timezone: string;
  createSession: (groupId: string, formData: FormData) => Promise<void>;
  deleteSession: (functionId: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mb-4">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Sessions
      </h4>
      {group.functions.length > 0 && (
        <div className="space-y-1 mb-2">
          {group.functions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded text-sm"
            >
              <div>
                <span className="font-medium text-gray-900 dark:text-white">{session.name}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-2">
                  {formatSessionTime(session.schedules, timezone)}
                </span>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete session "${session.name}"?`))
                    startTransition(() => deleteSession(session.id));
                }}
                disabled={isPending}
                className="text-red-400 hover:text-red-600 text-xs disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      {showAdd ? (
        <form
          action={(formData) => {
            startTransition(async () => {
              await createSession(group.id, formData);
              setShowAdd(false);
            });
          }}
          className="p-3 bg-gray-50 dark:bg-gray-800 rounded space-y-2"
        >
          <input
            name="name"
            placeholder="Session name"
            required
            autoFocus
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start</label>
              <input
                name="startTime"
                type="datetime-local"
                required
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End</label>
              <input
                name="endTime"
                type="datetime-local"
                required
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="text-gray-500 text-sm hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          + Add Session
        </button>
      )}
    </div>
  );
}

// ── Presentation Manager ───────────────────────────────────────────────────────

function PresentationManager({
  group,
  eventId,
  createPresentation,
}: {
  group: GroupData;
  eventId: string;
  createPresentation: (groupId: string, formData: FormData) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mb-4">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Presentations ({group.presentations.length})
      </h4>
      {group.presentations.length > 0 && (
        <div className="space-y-1 mb-2">
          {group.presentations.map((p) => {
            const placedCount = p.slots.length;
            const fullyPlaced = placedCount >= p.instanceCount;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {p.track && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.track.color || "#9ca3af" }}
                    />
                  )}
                  <Link
                    href={`/events/${eventId}/presentations/${p.id}`}
                    className="text-blue-600 hover:underline truncate"
                  >
                    {p.title}
                  </Link>
                </div>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                    fullyPlaced
                      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      : placedCount > 0
                      ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {placedCount}/{p.instanceCount}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {showAdd ? (
        <form
          action={(formData) => {
            startTransition(async () => {
              await createPresentation(group.id, formData);
              setShowAdd(false);
            });
          }}
          className="p-3 bg-gray-50 dark:bg-gray-800 rounded space-y-2"
        >
          <input
            name="title"
            placeholder="Presentation title"
            required
            autoFocus
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Instances (how many sessions)</label>
            <input
              name="instanceCount"
              type="number"
              min="1"
              defaultValue="1"
              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="text-gray-500 text-sm hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          + Add Presentation
        </button>
      )}
    </div>
  );
}

// ── Assignment Grid (sessions x rooms) ─────────────────────────────────────────

function AssignmentGrid({
  group,
  eventId,
  timezone,
  assignPresentation,
  removeSlot,
}: {
  group: GroupData;
  eventId: string;
  timezone: string;
  assignPresentation: (presentationId: string, functionId: string, roomId: string | null) => Promise<{ success: boolean; error?: string }>;
  removeSlot: (slotId: string) => Promise<void>;
}) {
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (group.functions.length === 0 || group.rooms.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
        {group.functions.length === 0
          ? "Add sessions to see the assignment grid."
          : "Add rooms to see the assignment grid."}
      </p>
    );
  }

  // All rooms used across all sessions (union of effective rooms)
  const allRooms = new Map<string, Room>();
  const sessionEffectiveRooms = new Map<string, Set<string>>();

  for (const session of group.functions) {
    const effective = getEffectiveRooms(session, group.rooms);
    sessionEffectiveRooms.set(session.id, new Set(effective.map((r) => r.id)));
    for (const room of effective) {
      allRooms.set(room.id, room);
    }
  }

  const roomList = Array.from(allRooms.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Unassigned presentations: one entry per remaining instance
  const unassignedCards: { presentation: GroupPresentation; instanceLabel: string }[] = [];
  for (const p of group.presentations) {
    const remaining = p.instanceCount - p.slots.length;
    for (let i = 0; i < remaining; i++) {
      unassignedCards.push({
        presentation: p,
        instanceLabel: `${p.slots.length + i + 1} of ${p.instanceCount}`,
      });
    }
  }

  const getSlotForCell = (sessionId: string, roomId: string): SlotData | undefined => {
    const session = group.functions.find((f) => f.id === sessionId);
    return session?.presentationSlots.find((s) => s.roomId === roomId);
  };

  const cellKey = (sessionId: string, roomId: string) => `${sessionId}:${roomId}`;

  // Get presentations already assigned to a session
  const getAssignedIds = (sessionId: string): Set<string> => {
    const session = group.functions.find((f) => f.id === sessionId);
    return new Set(session?.presentationSlots.map((s) => s.presentationId) ?? []);
  };

  const handleAssign = (presentationId: string, sessionId: string, roomId: string) => {
    if (!presentationId) return;
    startTransition(async () => {
      const result = await assignPresentation(presentationId, sessionId, roomId);
      if (!result.success) {
        setError(result.error ?? "Failed to assign");
      }
      setOpenCell(null);
    });
  };

  const handleRemove = (slotId: string) => {
    startTransition(async () => {
      await removeSlot(slotId);
    });
  };

  return (
    <div>
      {error && (
        <div className="mb-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-32">
                Room
              </th>
              {group.functions.map((session) => (
                <th
                  key={session.id}
                  className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap"
                >
                  <div>{session.name}</div>
                  <div className="font-normal text-gray-500 dark:text-gray-400">
                    {formatSessionTime(session.schedules, timezone)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomList.map((room) => (
              <tr key={room.id} className="h-16">
                <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap align-top">
                  {room.name}
                </td>
                {group.functions.map((session) => {
                  const effectiveIds = sessionEffectiveRooms.get(session.id);
                  const isAvailable = effectiveIds?.has(room.id) ?? false;

                  if (!isAvailable) {
                    return (
                      <td
                        key={session.id}
                        className="border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
                      />
                    );
                  }

                  const slot = getSlotForCell(session.id, room.id);
                  const key = cellKey(session.id, room.id);
                  const isOpen = openCell === key;
                  const assignedIds = getAssignedIds(session.id);
                  const availablePresentations = group.presentations.filter(
                    (p) => !assignedIds.has(p.id) && p.slots.length < p.instanceCount
                  );

                  return (
                    <td
                      key={session.id}
                      className={`border border-gray-200 dark:border-gray-700 px-2 py-1.5 align-top min-w-[160px] ${
                        slot ? "bg-blue-50 dark:bg-blue-950" : "bg-white dark:bg-gray-900"
                      }`}
                    >
                      {slot ? (
                        <div className="flex items-start justify-between gap-1">
                          <Link
                            href={`/events/${eventId}/presentations/${slot.presentationId}`}
                            className="text-blue-700 dark:text-blue-300 text-xs font-medium hover:underline truncate"
                          >
                            {slot.presentation.title}
                          </Link>
                          <button
                            onClick={() => handleRemove(slot.id)}
                            disabled={isPending}
                            className="text-red-400 hover:text-red-600 text-xs shrink-0 disabled:opacity-50"
                          >
                            &times;
                          </button>
                        </div>
                      ) : isOpen ? (
                        <div className="space-y-1">
                          <select
                            defaultValue=""
                            onChange={(e) => handleAssign(e.target.value, session.id, room.id)}
                            disabled={isPending}
                            autoFocus
                            className="w-full px-1 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                          >
                            <option value="">Select...</option>
                            {availablePresentations.map((p) => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setOpenCell(null)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setOpenCell(key); setError(null); }}
                          disabled={availablePresentations.length === 0 || isPending}
                          className="text-blue-500 hover:text-blue-700 text-xs disabled:opacity-30"
                        >
                          + Assign
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unassigned sidebar */}
      {unassignedCards.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Unassigned ({unassignedCards.length} remaining)
          </h4>
          <div className="flex flex-wrap gap-2">
            {unassignedCards.map((card, i) => (
              <div
                key={`${card.presentation.id}-${i}`}
                className="px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-xs"
              >
                <div className="font-medium text-amber-800 dark:text-amber-200 truncate max-w-[200px]">
                  {card.presentation.title}
                </div>
                <div className="text-amber-600 dark:text-amber-400">
                  {card.instanceLabel}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fully scheduled section */}
      {group.presentations.some((p) => p.slots.length >= p.instanceCount) && (
        <div className="mt-3">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Fully Scheduled
          </h4>
          <div className="flex flex-wrap gap-2">
            {group.presentations
              .filter((p) => p.slots.length >= p.instanceCount)
              .map((p) => (
                <span
                  key={p.id}
                  className="px-2 py-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300"
                >
                  {p.title} ({p.slots.length}/{p.instanceCount})
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Group Panel ────────────────────────────────────────────────────────────────

function GroupPanel({
  group,
  eventId,
  venueRooms,
  timezone,
  updateGroup,
  deleteGroup,
  addRoomToGroup,
  removeRoomFromGroup,
  createSession,
  deleteSession,
  assignPresentation,
  removeSlot,
  createGroupPresentation,
}: {
  group: GroupData;
  eventId: string;
  venueRooms: Room[];
  timezone: string;
  updateGroup: (groupId: string, formData: FormData) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  addRoomToGroup: (groupId: string, roomId: string) => Promise<void>;
  removeRoomFromGroup: (groupId: string, roomId: string) => Promise<void>;
  createSession: (groupId: string, formData: FormData) => Promise<void>;
  deleteSession: (functionId: string) => Promise<void>;
  assignPresentation: (presentationId: string, functionId: string, roomId: string | null) => Promise<{ success: boolean; error?: string }>;
  removeSlot: (slotId: string) => Promise<void>;
  createGroupPresentation: (groupId: string, formData: FormData) => Promise<void>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mb-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Group Header */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        {isRenaming ? (
          <form
            action={(formData) => {
              startTransition(async () => {
                await updateGroup(group.id, formData);
                setIsRenaming(false);
              });
            }}
            className="flex items-center gap-2"
          >
            <input
              name="name"
              defaultValue={group.name}
              autoFocus
              className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button type="submit" disabled={isPending} className="px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setIsRenaming(false)} className="text-gray-500 text-sm">Cancel</button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{group.name}</h3>
            {group.functions.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatSessionDate(group.functions[0].schedules, timezone)}
              </span>
            )}
          </div>
        )}
        {!isRenaming && (
          <div className="flex items-center gap-2">
            <button onClick={() => setIsRenaming(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">Rename</button>
            <button
              onClick={() => {
                if (confirm(`Delete group "${group.name}"? Sessions will become ungrouped.`))
                  startTransition(() => deleteGroup(group.id));
              }}
              disabled={isPending}
              className="text-red-400 hover:text-red-600 text-xs disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Group Body */}
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <GroupRoomManager
            group={group}
            venueRooms={venueRooms}
            addRoom={addRoomToGroup}
            removeRoom={removeRoomFromGroup}
          />
          <SessionManager
            group={group}
            timezone={timezone}
            createSession={createSession}
            deleteSession={deleteSession}
          />
          <PresentationManager
            group={group}
            eventId={eventId}
            createPresentation={createGroupPresentation}
          />
        </div>

        <AssignmentGrid
          group={group}
          eventId={eventId}
          timezone={timezone}
          assignPresentation={assignPresentation}
          removeSlot={removeSlot}
        />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function BreakoutGrid({
  eventId,
  groups,
  ungroupedBlocks,
  venueRooms,
  timezone,
  createGroup,
  updateGroup,
  deleteGroup,
  addRoomToGroup,
  removeRoomFromGroup,
  setSessionRoomOverride,
  removeSessionRoomOverride,
  createSession,
  updateSession,
  deleteSession,
  assignPresentation,
  moveSlot,
  removeSlot,
  createGroupPresentation,
}: BreakoutGridProps) {
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      {venueRooms.length === 0 && (
        <p className="mb-4 text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-2">
          No venue or rooms assigned to this event. Assign a venue to see room-based breakout scheduling.
        </p>
      )}

      {groups.map((group) => (
        <GroupPanel
          key={group.id}
          group={group}
          eventId={eventId}
          venueRooms={venueRooms}
          timezone={timezone}
          updateGroup={updateGroup}
          deleteGroup={deleteGroup}
          addRoomToGroup={addRoomToGroup}
          removeRoomFromGroup={removeRoomFromGroup}
          createSession={createSession}
          deleteSession={deleteSession}
          assignPresentation={assignPresentation}
          removeSlot={removeSlot}
          createGroupPresentation={createGroupPresentation}
        />
      ))}

      {ungroupedBlocks.length > 0 && (
        <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 className="text-base font-semibold text-gray-500 dark:text-gray-400 mb-3">
            Ungrouped Sessions ({ungroupedBlocks.length})
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">
            These sessions are not assigned to a group. Create a group and reassign them.
          </p>
          <div className="space-y-1">
            {ungroupedBlocks.map((block) => (
              <div key={block.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/events/${eventId}/functions/${block.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {block.name}
                </Link>
                <span className="text-gray-400">
                  {formatSessionTime(block.schedules, timezone)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Group */}
      <div className="mb-8">
        {showAddGroup ? (
          <form
            action={(formData) => {
              startTransition(async () => {
                await createGroup(formData);
                setShowAddGroup(false);
              });
            }}
            className="flex items-center gap-2"
          >
            <input
              name="name"
              placeholder="Group name"
              required
              autoFocus
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">Create</button>
            <button type="button" onClick={() => setShowAddGroup(false)} className="text-gray-500 text-sm hover:text-gray-700">Cancel</button>
          </form>
        ) : (
          <button
            onClick={() => setShowAddGroup(true)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            + Add Group
          </button>
        )}
      </div>
    </div>
  );
}
