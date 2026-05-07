"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
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

type AvailablePresentation = {
  id: string;
  title: string;
  instanceCount: number;
  track: { color: string | null } | null;
  speakers: { isPrimary: boolean; contact: { firstName: string; lastName: string } }[];
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
  getAvailablePresentations: (groupId: string) => Promise<AvailablePresentation[]>;
  assignExistingPresentation: (presentationId: string, groupId: string) => Promise<void>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPrimaryNames(
  speakers: { isPrimary: boolean; contact: { firstName: string; lastName: string } }[]
): string | null {
  const primaries = speakers.filter((s) => s.isPrimary);
  const source = primaries.length > 0 ? primaries : speakers.slice(0, 1);
  if (source.length === 0) return null;
  return source.map((s) => `${s.contact.firstName} ${s.contact.lastName}`).join(", ");
}

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
  getAvailablePresentations,
  assignExistingPresentation,
}: {
  group: GroupData;
  eventId: string;
  getAvailablePresentations: (groupId: string) => Promise<AvailablePresentation[]>;
  assignExistingPresentation: (presentationId: string, groupId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<AvailablePresentation[] | null>(null);
  const [filter, setFilter] = useState("");
  const [isPending, startTransition] = useTransition();

  const openPicker = () => {
    startTransition(async () => {
      const results = await getAvailablePresentations(group.id);
      setAvailable(results);
      setFilter("");
      setOpen(true);
    });
  };

  const close = () => {
    setOpen(false);
    setAvailable(null);
    setFilter("");
  };

  const filteredAvailable = useMemo(
    () => available
      ? available.filter((p) => p.title.toLowerCase().includes(filter.toLowerCase()))
      : [],
    [available, filter]
  );

  return (
    <div className="mb-4">
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Presentations ({group.presentations.length})
      </h4>
      {group.presentations.length > 0 && (
        <div className="mb-2">
          {[
            { label: "Unscheduled", items: group.presentations.filter((p) => p.slots.length === 0) },
            { label: "Partial", items: group.presentations.filter((p) => p.slots.length > 0 && p.slots.length < p.instanceCount) },
            { label: "Fully scheduled", items: group.presentations.filter((p) => p.slots.length >= p.instanceCount) },
          ].filter((g) => g.items.length > 0).map(({ label, items }) => (
            <div key={label} className="mb-2">
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((p) => {
                  const placedCount = p.slots.length;
                  const fullyPlaced = placedCount >= p.instanceCount;
                  return (
                    <div
                      key={p.id}
                      className="flex items-start gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300"
                    >
                      {p.track && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5"
                          style={{ backgroundColor: p.track.color || "#9ca3af" }}
                        />
                      )}
                      <Link
                        href={`/events/${eventId}/presentations/${p.id}`}
                        className="text-blue-600 hover:underline grow"
                      >
                        {p.title}
                      </Link>
                      <span
                        className={`px-1 rounded shrink-0 ${
                          fullyPlaced
                            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                            : placedCount > 0
                            ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                            : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {placedCount}/{p.instanceCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!open && (
        <button
          onClick={openPicker}
          disabled={isPending}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          {isPending ? "Loading..." : "+ Add Presentation"}
        </button>
      )}

      {open && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded space-y-2">
          {available !== null && available.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No unassigned presentations.{" "}
              <Link href={`/events/${eventId}/presentations/new`} className="text-blue-600 hover:underline">
                Create one
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter presentations..."
                autoFocus
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredAvailable.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 py-1">No presentations match.</p>
                ) : (
                  filteredAvailable.map((p) => {
                    const speakerName = getPrimaryNames(p.speakers);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {p.track && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: p.track.color || "#9ca3af" }}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-gray-900 dark:text-white">{p.title}</div>
                            {speakerName && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {speakerName}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            startTransition(async () => {
                              await assignExistingPresentation(p.id, group.id);
                              close();
                            });
                          }}
                          disabled={isPending}
                          className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={close}
            className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── DnD Types ─────────────────────────────────────────────────────────────────

type SidebarDragData = {
  type: "sidebar";
  presentationId: string;
  title: string;
  trackColor: string | null;
};

type CellDragData = {
  type: "cell";
  slotId: string;
  presentationId: string;
  title: string;
  trackColor: string | null;
  sessionId: string;
  roomId: string;
};

type DragItemData = SidebarDragData | CellDragData;

type DropCellData = {
  sessionId: string;
  roomId: string;
};

// ── DnD Components ────────────────────────────────────────────────────────────

function DraggableSidebarCard({
  presentation,
  instanceLabel,
  instanceIndex,
}: {
  presentation: GroupPresentation;
  instanceLabel: string;
  instanceIndex: number;
}) {
  const dragId = `sidebar:${presentation.id}:${instanceIndex}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: {
      type: "sidebar",
      presentationId: presentation.id,
      title: presentation.title,
      trackColor: presentation.track?.color ?? null,
    } satisfies SidebarDragData,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-xs cursor-grab active:cursor-grabbing select-none ${
        isDragging ? "opacity-40" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-1.5">
        {presentation.track?.color && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: presentation.track.color }}
          />
        )}
        <span className="font-medium text-amber-800 dark:text-amber-200 truncate max-w-[180px]">
          {presentation.title}
        </span>
      </div>
      {getPrimaryNames(presentation.speakers) && (
        <div className="text-amber-700 dark:text-amber-300 mt-0.5">
          {getPrimaryNames(presentation.speakers)}
        </div>
      )}
      <div className="text-amber-600 dark:text-amber-400 mt-0.5">
        {instanceLabel}
      </div>
      {presentation.schedulingNotes && (
        <div className="text-amber-700 dark:text-amber-300 mt-0.5 line-clamp-2 opacity-80">
          {presentation.schedulingNotes}
        </div>
      )}
    </div>
  );
}

function DraggableCellCard({
  slot,
  eventId,
  sessionId,
  onRemove,
}: {
  slot: SlotData;
  eventId: string;
  sessionId: string;
  onRemove: (slotId: string) => void;
}) {
  const dragId = `cell:${slot.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: {
      type: "cell",
      slotId: slot.id,
      presentationId: slot.presentationId,
      title: slot.presentation.title,
      trackColor: null,
      sessionId,
      roomId: slot.roomId ?? "",
    } satisfies CellDragData,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start justify-between gap-1 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-1 w-full">
        <div className="min-w-0">
          <Link
            href={`/events/${eventId}/presentations/${slot.presentationId}`}
            className="text-blue-700 dark:text-blue-300 text-xs font-medium hover:underline break-words"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {slot.presentation.title}
          </Link>
          {getPrimaryNames(slot.presentation.speakers) && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {getPrimaryNames(slot.presentation.speakers)}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slot.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-red-400 hover:text-red-600 text-xs shrink-0"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

function DroppableGridCell({
  sessionId,
  roomId,
  isAvailable,
  children,
}: {
  sessionId: string;
  roomId: string;
  isAvailable: boolean;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${sessionId}:${roomId}`,
    data: { sessionId, roomId } satisfies DropCellData,
    disabled: !isAvailable,
  });

  if (!isAvailable) {
    return (
      <td
        ref={setNodeRef}
        className="border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
      />
    );
  }

  const hasContent = !!children;
  const bg = hasContent
    ? isOver
      ? "bg-blue-100 dark:bg-blue-900"
      : "bg-blue-50 dark:bg-blue-950"
    : isOver
    ? "bg-blue-50 dark:bg-blue-950"
    : "bg-white dark:bg-gray-900";

  return (
    <td
      ref={setNodeRef}
      className={`border border-gray-200 dark:border-gray-700 px-2 py-1.5 align-top min-w-[160px] ${bg} transition-colors`}
    >
      {children}
    </td>
  );
}

function DragOverlayCard({ data }: { data: DragItemData }) {
  return (
    <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 rounded shadow-lg opacity-90 text-xs max-w-[200px]">
      <div className="flex items-center gap-1.5">
        {data.trackColor && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: data.trackColor }}
          />
        )}
        <span className="font-medium text-blue-800 dark:text-blue-200 truncate">
          {data.title}
        </span>
      </div>
    </div>
  );
}

// ── Assignment Grid (sessions x rooms) with DnD ──────────────────────────────

function AssignmentGrid({
  group,
  eventId,
  timezone,
  assignPresentation,
  moveSlot,
  removeSlot,
}: {
  group: GroupData;
  eventId: string;
  timezone: string;
  assignPresentation: (presentationId: string, functionId: string, roomId: string | null) => Promise<{ success: boolean; error?: string }>;
  moveSlot: (slotId: string, newFunctionId: string, newRoomId: string | null) => Promise<{ success: boolean; error?: string }>;
  removeSlot: (slotId: string) => Promise<void>;
}) {
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimisticGroup, setOptimisticGroup] = useState(group);
  const snapshotRef = useRef(group);

  // Keep optimistic state in sync with server data when not dragging
  if (!activeDrag && group !== optimisticGroup && group !== snapshotRef.current) {
    setOptimisticGroup(group);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  if (group.functions.length === 0 || group.rooms.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
        {group.functions.length === 0
          ? "Add sessions to see the assignment grid."
          : "Add rooms to see the assignment grid."}
      </p>
    );
  }

  // Compute effective rooms per session
  const allRooms = new Map<string, Room>();
  const sessionEffectiveRooms = new Map<string, Set<string>>();

  for (const session of optimisticGroup.functions) {
    const effective = getEffectiveRooms(session, optimisticGroup.rooms);
    sessionEffectiveRooms.set(session.id, new Set(effective.map((r) => r.id)));
    for (const room of effective) {
      allRooms.set(room.id, room);
    }
  }

  const roomList = Array.from(allRooms.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Unassigned presentations: one entry per remaining instance
  const unassignedCards: { presentation: GroupPresentation; instanceLabel: string; instanceIndex: number }[] = [];
  for (const p of optimisticGroup.presentations) {
    const remaining = p.instanceCount - p.slots.length;
    for (let i = 0; i < remaining; i++) {
      unassignedCards.push({
        presentation: p,
        instanceLabel: `${p.slots.length + i + 1} of ${p.instanceCount}`,
        instanceIndex: i,
      });
    }
  }

  const getSlotForCell = (sessionId: string, roomId: string): SlotData | undefined => {
    const session = optimisticGroup.functions.find((f) => f.id === sessionId);
    return session?.presentationSlots.find((s) => s.roomId === roomId);
  };

  // Optimistic state helpers
  const applyOptimisticAssign = (
    presentationId: string,
    sessionId: string,
    roomId: string
  ): GroupData => {
    const g = { ...optimisticGroup };
    g.functions = g.functions.map((fn) => {
      if (fn.id !== sessionId) return fn;
      const presentation = g.presentations.find((p) => p.id === presentationId);
      if (!presentation) return fn;
      const newSlot: SlotData = {
        id: `optimistic-${Date.now()}`,
        functionId: sessionId,
        presentationId,
        roomId,
        createdAt: new Date(),
        presentation: { ...presentation, speakers: presentation.speakers },
        room: roomList.find((r) => r.id === roomId) ?? null,
      };
      return { ...fn, presentationSlots: [...fn.presentationSlots, newSlot] };
    });
    g.presentations = g.presentations.map((p) => {
      if (p.id !== presentationId) return p;
      return {
        ...p,
        slots: [...p.slots, { id: `optimistic-${Date.now()}`, functionId: sessionId, presentationId, roomId, createdAt: new Date() }],
      };
    });
    return g;
  };

  const applyOptimisticMove = (
    slotId: string,
    fromSessionId: string,
    toSessionId: string,
    toRoomId: string
  ): GroupData => {
    const g = { ...optimisticGroup };
    // Find the slot being moved
    const fromSession = g.functions.find((f) => f.id === fromSessionId);
    const existingSlot = fromSession?.presentationSlots.find((s) => s.id === slotId);
    if (!existingSlot) return g;

    g.functions = g.functions.map((fn) => {
      if (fn.id === fromSessionId && fn.id === toSessionId) {
        // Same session, just update room
        return {
          ...fn,
          presentationSlots: fn.presentationSlots.map((s) =>
            s.id === slotId
              ? { ...s, roomId: toRoomId, room: roomList.find((r) => r.id === toRoomId) ?? null }
              : s
          ),
        };
      }
      if (fn.id === fromSessionId) {
        return { ...fn, presentationSlots: fn.presentationSlots.filter((s) => s.id !== slotId) };
      }
      if (fn.id === toSessionId) {
        const movedSlot: SlotData = {
          ...existingSlot,
          id: `optimistic-move-${Date.now()}`,
          functionId: toSessionId,
          roomId: toRoomId,
          room: roomList.find((r) => r.id === toRoomId) ?? null,
        };
        return { ...fn, presentationSlots: [...fn.presentationSlots, movedSlot] };
      }
      return fn;
    });

    return g;
  };

  const applyOptimisticRemove = (slotId: string): GroupData => {
    const g = { ...optimisticGroup };
    let removedPresentationId: string | null = null;
    g.functions = g.functions.map((fn) => {
      const slot = fn.presentationSlots.find((s) => s.id === slotId);
      if (slot) removedPresentationId = slot.presentationId;
      return { ...fn, presentationSlots: fn.presentationSlots.filter((s) => s.id !== slotId) };
    });
    if (removedPresentationId) {
      g.presentations = g.presentations.map((p) => {
        if (p.id !== removedPresentationId) return p;
        return { ...p, slots: p.slots.filter((s) => s.id !== slotId) };
      });
    }
    return g;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragItemData;
    setActiveDrag(data);
    setError(null);
    snapshotRef.current = optimisticGroup;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const dragData = event.active.data.current as DragItemData;
    const dropData = event.over?.data.current as DropCellData | undefined;
    setActiveDrag(null);

    if (!dropData) return;

    const { sessionId: targetSessionId, roomId: targetRoomId } = dropData;

    if (dragData.type === "sidebar") {
      // Assign from sidebar
      const snapshot = optimisticGroup;
      setOptimisticGroup(applyOptimisticAssign(dragData.presentationId, targetSessionId, targetRoomId));

      const result = await assignPresentation(dragData.presentationId, targetSessionId, targetRoomId);
      if (!result.success) {
        setOptimisticGroup(snapshot);
        setError(result.error ?? "Failed to assign");
      }
    } else {
      // Move from existing cell
      const { slotId, sessionId: sourceSessionId, roomId: sourceRoomId } = dragData;
      if (sourceSessionId === targetSessionId && sourceRoomId === targetRoomId) return;

      const snapshot = optimisticGroup;
      setOptimisticGroup(applyOptimisticMove(slotId, sourceSessionId, targetSessionId, targetRoomId));

      const result = await moveSlot(slotId, targetSessionId, targetRoomId);
      if (!result.success) {
        setOptimisticGroup(snapshot);
        setError(result.error ?? "Failed to move");
      }
    }
  };

  const handleRemove = async (slotId: string) => {
    const snapshot = optimisticGroup;
    setOptimisticGroup(applyOptimisticRemove(slotId));
    try {
      await removeSlot(slotId);
    } catch {
      setOptimisticGroup(snapshot);
      setError("Failed to remove assignment");
    }
  };

  return (
    <DndContext
      id={`breakout-dnd-${group.id}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div>
        {error && (
          <div className="mb-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-3 py-2">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm table-fixed">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-40">
                  Session
                </th>
                {roomList.map((room) => (
                  <th
                    key={room.id}
                    className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-900 dark:text-white w-40"
                  >
                    {room.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {optimisticGroup.functions.map((session) => {
                const effectiveIds = sessionEffectiveRooms.get(session.id);
                return (
                  <tr key={session.id}>
                    <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap align-top">
                      <div className="text-gray-900 dark:text-white">{session.name}</div>
                      <div className="text-gray-500 dark:text-gray-400 font-normal">
                        {formatSessionTime(session.schedules, timezone)}
                      </div>
                    </td>
                    {roomList.map((room) => {
                      const isAvailable = effectiveIds?.has(room.id) ?? false;
                      const slot = isAvailable ? getSlotForCell(session.id, room.id) : undefined;

                      return (
                        <DroppableGridCell
                          key={room.id}
                          sessionId={session.id}
                          roomId={room.id}
                          isAvailable={isAvailable}
                        >
                          {slot && (
                            <DraggableCellCard
                              slot={slot}
                              eventId={eventId}
                              sessionId={session.id}
                              onRemove={handleRemove}
                            />
                          )}
                        </DroppableGridCell>
                      );
                    })}
                  </tr>
                );
              })}
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
              {unassignedCards.map((card) => (
                <DraggableSidebarCard
                  key={`${card.presentation.id}-${card.instanceIndex}`}
                  presentation={card.presentation}
                  instanceLabel={card.instanceLabel}
                  instanceIndex={card.instanceIndex}
                />
              ))}
            </div>
          </div>
        )}

        {/* Fully scheduled section */}
        {optimisticGroup.presentations.some((p) => p.slots.length >= p.instanceCount) && (
          <div className="mt-3">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Fully Scheduled
            </h4>
            <div className="flex flex-wrap gap-2">
              {optimisticGroup.presentations
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

      <DragOverlay>
        {activeDrag && <DragOverlayCard data={activeDrag} />}
      </DragOverlay>
    </DndContext>
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
  moveSlot,
  removeSlot,
  getAvailablePresentations,
  assignExistingPresentation,
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
  moveSlot: (slotId: string, newFunctionId: string, newRoomId: string | null) => Promise<{ success: boolean; error?: string }>;
  removeSlot: (slotId: string) => Promise<void>;
  getAvailablePresentations: (groupId: string) => Promise<AvailablePresentation[]>;
  assignExistingPresentation: (presentationId: string, groupId: string) => Promise<void>;
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
            getAvailablePresentations={getAvailablePresentations}
            assignExistingPresentation={assignExistingPresentation}
          />
        </div>

        <AssignmentGrid
          group={group}
          eventId={eventId}
          timezone={timezone}
          assignPresentation={assignPresentation}
          moveSlot={moveSlot}
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
  getAvailablePresentations,
  assignExistingPresentation,
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
          moveSlot={moveSlot}
          removeSlot={removeSlot}
          getAvailablePresentations={getAvailablePresentations}
          assignExistingPresentation={assignExistingPresentation}
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
