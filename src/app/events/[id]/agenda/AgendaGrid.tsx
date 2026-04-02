"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { CSS } from "@dnd-kit/utilities";
import {
  type SerializedAgendaData,
  type AgendaData,
  type AgendaEntry,
  deserializeAgendaData,
  computeRowspan,
  formatDateHeading,
  formatTime,
  getUsedRoomIds,
  getDateKeyInTimezone,
  SLOT_INTERVAL_MS,
} from "@/lib/agendaUtils";
import { updateFunctionRoom, rescheduleEntry, scheduleUnscheduledFunction } from "@/app/events/functions/actions";
import { DateTabs } from "./DateTabs";
import { HideEmptyToggle } from "./HideEmptyToggle";

type AgendaGridProps = {
  eventId: string;
  agendaData: SerializedAgendaData;
  timezone: string;
  activeDate: string | null;
  hideEmpty: boolean;
};

type ScheduledDragData = {
  entry: AgendaEntry;
  sourceRoomId: string;
};

type UnscheduledDragData = {
  unscheduled: true;
  functionId: string;
  functionName: string;
};

type DragData = ScheduledDragData | UnscheduledDragData;

type DropData = {
  roomId: string;
  slotTime: Date;
};

type ResizeState = {
  entry: AgendaEntry;
  roomId: string;
  type: "start" | "end";
  startY: number;
  originalStart: Date;
  originalEnd: Date;
  snapshot: AgendaData;
};

type OnResizeStart = (
  e: React.PointerEvent,
  entry: AgendaEntry,
  roomId: string,
  type: "start" | "end"
) => void;

// h-14 rows = 56px = one 30-minute slot
const ROW_HEIGHT_PX = 56;

function EntryContent({
  entry,
  eventId,
  timezone,
}: {
  entry: AgendaEntry;
  eventId: string;
  timezone: string;
}) {
  const typeDisplay = entry.scheduleTypeLabel || entry.scheduleType;
  return (
    <div className="px-1.5 pt-3 pb-1 text-xs h-full">
      <div className="font-medium text-blue-700 dark:text-blue-300 truncate leading-tight">
        {entry.functionName}
      </div>
      <div className="text-blue-500 dark:text-blue-400 leading-tight mt-0.5 truncate">
        {formatTime(entry.startTime, timezone)} –{" "}
        {formatTime(entry.endTime, timezone)}
        {entry.scheduleType && entry.scheduleType !== "MAIN" && (
          <span className="ml-1 opacity-75">· {typeDisplay}</span>
        )}
      </div>
      {entry.scheduleNotes && (
        <div className="text-blue-500 dark:text-blue-400 leading-tight mt-0.5 line-clamp-1 italic">
          {entry.scheduleNotes}
        </div>
      )}
      {entry.presentationTitles.length > 0 && (
        <div className="text-blue-400 dark:text-blue-500 leading-tight mt-0.5 line-clamp-2">
          {entry.presentationTitles.join(", ")}
        </div>
      )}
      {entry.functionDescription && entry.presentationTitles.length === 0 && (
        <div className="text-blue-400 dark:text-blue-500 leading-tight mt-0.5 line-clamp-2">
          {entry.functionDescription}
        </div>
      )}
    </div>
  );
}

function ResizeHandle({
  position,
  onPointerDown,
}: {
  position: "top" | "bottom";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={`absolute ${position === "top" ? "top-0" : "bottom-0"} left-0 right-0 h-3 flex items-center justify-center cursor-ns-resize z-10 group/handle`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onPointerDown(e);
      }}
    >
      <div className="w-8 h-1 rounded-full bg-blue-300 dark:bg-blue-600 group-hover/handle:bg-blue-500 dark:group-hover/handle:bg-blue-400 transition-colors" />
    </div>
  );
}

function DraggableCard({
  entry,
  sourceRoomId,
  eventId,
  timezone,
  onResizeStart,
}: {
  entry: AgendaEntry;
  sourceRoomId: string;
  eventId: string;
  timezone: string;
  onResizeStart: OnResizeStart;
}) {
  const router = useRouter();
  const draggedRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${entry.scheduleId}:${sourceRoomId}`,
    data: { entry, sourceRoomId } satisfies DragData,
  });

  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`h-full relative cursor-grab active:cursor-grabbing${isDragging ? " opacity-40" : ""}`}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        router.push(`/events/${eventId}/functions/${entry.functionId}`);
      }}
      {...listeners}
      {...attributes}
    >
      <ResizeHandle
        position="top"
        onPointerDown={(e) => onResizeStart(e, entry, sourceRoomId, "start")}
      />
      <EntryContent entry={entry} eventId={eventId} timezone={timezone} />
      <ResizeHandle
        position="bottom"
        onPointerDown={(e) => onResizeStart(e, entry, sourceRoomId, "end")}
      />
    </div>
  );
}

function DroppableCell({
  roomId,
  slotTime,
  rowSpan,
  children,
  isEmpty,
}: {
  roomId: string;
  slotTime: Date;
  rowSpan?: number;
  children?: React.ReactNode;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${roomId}:${slotTime.toISOString()}`,
    data: { roomId, slotTime } satisfies DropData,
  });

  const base = "border border-gray-200 dark:border-gray-700 align-top p-0";
  const bg = isEmpty
    ? isOver
      ? "bg-blue-50 dark:bg-blue-950"
      : "bg-white dark:bg-gray-900"
    : isOver
    ? "bg-blue-100 dark:bg-blue-900"
    : "bg-blue-50 dark:bg-blue-950";

  return (
    <td ref={setNodeRef} rowSpan={rowSpan} className={`${base} ${bg}`} style={{ height: "1px" }}>
      {children}
    </td>
  );
}

function DayGrid({
  day,
  rooms,
  eventId,
  timezone,
  hideEmpty,
  onResizeStart,
}: {
  day: AgendaData["days"][number];
  rooms: AgendaData["rooms"];
  eventId: string;
  timezone: string;
  hideEmpty: boolean;
  onResizeStart: OnResizeStart;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleRooms = hideEmpty
    ? rooms.filter((r) => getUsedRoomIds(day).has(r.id))
    : rooms;

  // Scroll to 30 min before the first event when the day changes
  useEffect(() => {
    if (!scrollRef.current) return;
    let earliestMs = Infinity;
    Array.from(day.cells.values()).forEach((col) => {
      Array.from(col.keys()).forEach((key) => {
        const ms = new Date(key).getTime();
        if (ms < earliestMs) earliestMs = ms;
      });
    });
    if (!isFinite(earliestMs)) return;
    const slotIndex = day.timeSlots.findIndex((s) => s.getTime() >= earliestMs - SLOT_INTERVAL_MS);
    if (slotIndex >= 0) {
      scrollRef.current.scrollTop = slotIndex * ROW_HEIGHT_PX;
    }
  }, [day]);

  if (visibleRooms.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No scheduled functions for this day.
      </p>
    );
  }

  const skipMap = new Map<string, number>();

  type CellRender =
    | { type: "skip" }
    | { type: "empty"; slotTime: Date }
    | { type: "entries"; entries: AgendaEntry[]; rowspan: number; slotTime: Date };

  const rowData: Array<{ slotTime: Date; cells: CellRender[] }> = [];

  for (const slot of day.timeSlots) {
    const slotKey = slot.toISOString();
    const cells: CellRender[] = [];

    for (const room of visibleRooms) {
      const remaining = skipMap.get(room.id) ?? 0;
      if (remaining > 0) {
        skipMap.set(room.id, remaining - 1);
        cells.push({ type: "skip" });
        continue;
      }

      const entries = day.cells.get(room.id)?.get(slotKey) ?? [];

      if (entries.length === 0) {
        cells.push({ type: "empty", slotTime: slot });
      } else {
        const maxSpan = Math.max(
          ...entries.map((e) => computeRowspan(e, day.timeSlots))
        );
        if (maxSpan > 1) {
          skipMap.set(room.id, maxSpan - 1);
        }
        cells.push({ type: "entries", entries, rowspan: maxSpan, slotTime: slot });
      }
    }

    rowData.push({ slotTime: slot, cells });
  }

  return (
    <div className="overflow-x-auto">
      <div ref={scrollRef} className="h-[550px] overflow-y-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50 dark:bg-gray-800">
            <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap w-24">
              Time
            </th>
            {visibleRooms.map((room) => (
              <th
                key={room.id}
                className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-medium text-gray-900 dark:text-white whitespace-nowrap"
              >
                {room.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowData.map(({ slotTime, cells }) => (
            <tr key={slotTime.toISOString()} className="h-14">
              <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap align-top font-medium">
                {formatTime(slotTime, timezone)}
              </td>
              {cells.map((cell, i) => {
                if (cell.type === "skip") return null;
                const room = visibleRooms[i];
                if (cell.type === "empty") {
                  return (
                    <DroppableCell
                      key={room.id}
                      roomId={room.id}
                      slotTime={cell.slotTime}
                      isEmpty={true}
                    />
                  );
                }
                return (
                  <DroppableCell
                    key={room.id}
                    roomId={room.id}
                    slotTime={cell.slotTime}
                    rowSpan={cell.rowspan}
                    isEmpty={false}
                  >
                    {cell.entries.map((entry) => (
                      <DraggableCard
                        key={entry.scheduleId}
                        entry={entry}
                        sourceRoomId={room.id}
                        eventId={eventId}
                        timezone={timezone}
                        onResizeStart={onResizeStart}
                      />
                    ))}
                  </DroppableCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function OverlayCard({
  entry,
  eventId,
  timezone,
}: {
  entry: AgendaEntry;
  eventId: string;
  timezone: string;
}) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 rounded shadow-lg opacity-90 w-48">
      <EntryContent entry={entry} eventId={eventId} timezone={timezone} />
    </div>
  );
}

function DraggableUnscheduledCard({
  fn,
  eventId,
}: {
  fn: { id: string; name: string; rooms: { roomId: string; room: { name: string } }[]; schedules: { id: string }[] };
  eventId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unscheduled:${fn.id}`,
    data: { unscheduled: true, functionId: fn.id, functionName: fn.name } satisfies DragData,
  });

  const missingInfo = fn.rooms.length === 0 && fn.schedules.length === 0
    ? "No room, no schedule"
    : fn.rooms.length === 0
    ? "No room assigned"
    : "No schedule";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`px-4 py-3 bg-white dark:bg-gray-900 flex items-center justify-between gap-4 cursor-grab active:cursor-grabbing${isDragging ? " opacity-40" : ""}`}
      {...listeners}
      {...attributes}
    >
      <div>
        <Link
          href={`/events/${eventId}/functions/${fn.id}`}
          className="text-sm font-medium text-blue-600 hover:underline"
          onClick={(e) => { if (isDragging) e.preventDefault(); }}
        >
          {fn.name}
        </Link>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {missingInfo}
        </div>
      </div>
    </div>
  );
}

export function AgendaGrid({
  eventId,
  agendaData: serializedData,
  timezone,
  activeDate,
  hideEmpty,
}: AgendaGridProps) {
  const router = useRouter();
  const [agendaData, setAgendaData] = useState<AgendaData>(() => deserializeAgendaData(serializedData));
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Always-current ref so callbacks can snapshot state without stale closures
  const agendaDataRef = useRef(agendaData);
  agendaDataRef.current = agendaData;

  const { days, rooms, unscheduled } = agendaData;
  const resolvedDate = activeDate ?? days[0]?.dateKey ?? null;
  const activeDay = days.find((d) => d.dateKey === resolvedDate) ?? days[0];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleResizeStart = useCallback<OnResizeStart>(
    (e, entry, roomId, type) => {
      setErrorMsg(null);
      setResizing({
        entry,
        roomId,
        type,
        startY: e.clientY,
        originalStart: entry.startTime,
        originalEnd: entry.endTime,
        snapshot: agendaDataRef.current,
      });
    },
    []
  );

  useEffect(() => {
    if (!resizing) return;

    // Local vars track slot delta and computed times within this resize session.
    // Skipping updates when delta unchanged avoids rebuilding Maps at 60Hz.
    let lastSlotDelta: number | null = null;
    let lastTimes: { newStart: Date; newEnd: Date } | null = null;

    const handleMove = (e: PointerEvent) => {
      const slotDelta = Math.round((e.clientY - resizing.startY) / ROW_HEIGHT_PX);
      if (slotDelta === lastSlotDelta) return;
      lastSlotDelta = slotDelta;
      const times = calcResizeTimes(resizing, e.clientY);
      lastTimes = times;
      setAgendaData(applyResizeToState(resizing.snapshot, resizing.entry, resizing.roomId, times.newStart, times.newEnd, timezone));
    };

    const handleUp = async (e: PointerEvent) => {
      const { newStart, newEnd } = lastTimes ?? calcResizeTimes(resizing, e.clientY);
      const { entry, roomId, originalStart, originalEnd, snapshot } = resizing;
      setResizing(null);

      if (newStart.getTime() === originalStart.getTime() && newEnd.getTime() === originalEnd.getTime()) return;

      const result = await rescheduleEntry(
        entry.scheduleId,
        entry.functionId,
        newStart.toISOString(),
        newEnd.toISOString(),
        eventId
      );
      if (!result.success) {
        setAgendaData(snapshot);
        setErrorMsg(result.error ?? "Failed to resize.");
      } else {
        router.refresh();
      }
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [resizing, timezone, eventId, router]);

  const handleDragStart = useCallback((ev: DragStartEvent) => {
    setActiveDrag(ev.active.data.current as DragData);
    setErrorMsg(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDrag(null);
      const drag = event.active.data.current as DragData;
      const drop = event.over?.data.current as DropData | undefined;

      if (!drop) return;

      // Handle unscheduled item drops
      if ("unscheduled" in drag && drag.unscheduled) {
        const { functionId } = drag;
        const { roomId, slotTime } = drop;
        const endTime = new Date(slotTime.getTime() + SLOT_INTERVAL_MS * 2); // Default 1 hour

        const result = await scheduleUnscheduledFunction(
          functionId,
          roomId,
          slotTime.toISOString(),
          endTime.toISOString(),
          eventId
        );
        if (!result.success) {
          setErrorMsg(result.error ?? "Failed to schedule.");
        } else {
          router.refresh();
        }
        return;
      }

      // Narrow to scheduled entry drag
      if (!("entry" in drag)) return;
      const { entry, sourceRoomId } = drag;
      const { roomId: targetRoomId, slotTime: targetSlot } = drop;

      const roomChanged = targetRoomId !== sourceRoomId;
      const deltaMs = targetSlot.getTime() - entry.startTime.getTime();
      const timeChanged = deltaMs !== 0;

      if (!roomChanged && !timeChanged) return;

      if (roomChanged && entry.roomIds.includes(targetRoomId)) {
        setErrorMsg("That room is already assigned to this function.");
        return;
      }

      // Warn if room change affects multiple schedule entries for the same function
      if (roomChanged) {
        const scheduleCount = countFunctionSchedules(agendaDataRef.current, entry.functionId);
        if (scheduleCount > 1) {
          const confirmed = window.confirm(
            `"${entry.functionName}" has ${scheduleCount} scheduled time slots. Moving to a new room will affect all of them. Continue?`
          );
          if (!confirmed) return;
        }
      }

      const newStart = timeChanged ? new Date(entry.startTime.getTime() + deltaMs) : entry.startTime;
      const newEnd = timeChanged ? new Date(entry.endTime.getTime() + deltaMs) : entry.endTime;

      if (timeChanged && getDateKeyInTimezone(newStart, timezone) !== getDateKeyInTimezone(newEnd, timezone)) {
        setErrorMsg("Cannot reschedule past midnight.");
        return;
      }

      const snapshot = agendaDataRef.current;
      setAgendaData(applyDragToState(snapshot, drag, drop, deltaMs, timezone));

      const ops: Promise<{ success: boolean; error?: string }>[] = [];
      if (roomChanged) {
        ops.push(updateFunctionRoom(entry.functionId, sourceRoomId, targetRoomId, eventId));
      }
      if (timeChanged) {
        ops.push(
          rescheduleEntry(entry.scheduleId, entry.functionId, newStart.toISOString(), newEnd.toISOString(), eventId)
        );
      }

      const results = await Promise.all(ops);
      const failed = results.find((r) => !r.success);
      if (failed) {
        setAgendaData(snapshot);
        setErrorMsg(failed.error ?? "Failed to save change.");
      } else {
        router.refresh();
      }
    },
    [eventId, timezone, router]
  );

  return (
    <DndContext id="agenda-dnd" sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div>
        {errorMsg && (
          <div className="mb-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-3 py-2">
            {errorMsg}
          </div>
        )}

        {rooms.length === 0 && (
          <p className="mb-4 text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-2">
            No venue or rooms assigned to this event. Assign a venue to see the
            room-based agenda.
          </p>
        )}

        {days.length === 0 && rooms.length > 0 && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            No functions with both a room and schedule assigned yet.
          </p>
        )}

        {days.length > 1 && (
          <DateTabs
            eventId={eventId}
            days={days.map((d) => d.dateKey)}
            activeDate={resolvedDate!}
            timezone={timezone}
          />
        )}

        {days.length > 0 && (
          <div className="flex items-center justify-between mb-4 gap-4">
            <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">
              {resolvedDate ? formatDateHeading(resolvedDate, timezone) : ""}
            </h2>
            {rooms.length > 0 && (
              <HideEmptyToggle eventId={eventId} hideEmpty={hideEmpty} />
            )}
          </div>
        )}

        {activeDay && (
          <DayGrid
            day={activeDay}
            rooms={rooms}
            eventId={eventId}
            timezone={timezone}
            hideEmpty={hideEmpty}
            onResizeStart={handleResizeStart}
          />
        )}

        {unscheduled.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-medium text-gray-700 dark:text-gray-300 mb-3">
              Unscheduled Items ({unscheduled.length})
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Drag items to the grid to quickly schedule them.
            </p>
            <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {unscheduled.map((fn) => (
                <DraggableUnscheduledCard key={fn.id} fn={fn} eventId={eventId} />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeDrag && "entry" in activeDrag && (
          <OverlayCard
            entry={activeDrag.entry}
            eventId={eventId}
            timezone={timezone}
          />
        )}
        {activeDrag && "unscheduled" in activeDrag && (
          <div className="bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-700 rounded shadow-lg opacity-90 px-3 py-2 w-48">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
              {activeDrag.functionName}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function countFunctionSchedules(data: AgendaData, functionId: string): number {
  const seen = new Set<string>();
  for (const day of data.days) {
    Array.from(day.cells.values()).forEach((slotMap) => {
      Array.from(slotMap.values()).forEach((entries) => {
        for (const e of entries) {
          if (e.functionId === functionId) seen.add(e.scheduleId);
        }
      });
    });
  }
  return seen.size;
}

function calcResizeTimes(
  state: ResizeState,
  clientY: number
): { newStart: Date; newEnd: Date } {
  const slotDelta = Math.round((clientY - state.startY) / ROW_HEIGHT_PX);
  if (state.type === "end") {
    const rawEnd = new Date(state.originalEnd.getTime() + slotDelta * SLOT_INTERVAL_MS);
    const minEnd = new Date(state.originalStart.getTime() + SLOT_INTERVAL_MS);
    return { newStart: state.originalStart, newEnd: rawEnd > minEnd ? rawEnd : minEnd };
  } else {
    const rawStart = new Date(state.originalStart.getTime() + slotDelta * SLOT_INTERVAL_MS);
    const maxStart = new Date(state.originalEnd.getTime() - SLOT_INTERVAL_MS);
    return { newStart: rawStart < maxStart ? rawStart : maxStart, newEnd: state.originalEnd };
  }
}

function applyResizeToState(
  base: AgendaData,
  entry: AgendaEntry,
  roomId: string,
  newStart: Date,
  newEnd: Date,
  timezone: string
): AgendaData {
  const updatedEntry: AgendaEntry = { ...entry, startTime: newStart, endTime: newEnd };
  const dateKey = getDateKeyInTimezone(entry.startTime, timezone);

  const days = base.days.map((day) => {
    if (day.dateKey !== dateKey) return day;

    const cells = new Map(
      Array.from(day.cells.entries()).map(([rid, slotMap]) => [rid, new Map(slotMap)])
    );

    const col = cells.get(roomId);
    if (!col) return day;

    const oldKey = entry.startTime.toISOString();
    const filtered = (col.get(oldKey) ?? []).filter((e) => e.scheduleId !== entry.scheduleId);
    if (filtered.length === 0) col.delete(oldKey);
    else col.set(oldKey, filtered);

    const newKey = newStart.toISOString();
    col.set(newKey, [...(col.get(newKey) ?? []), updatedEntry]);

    return { ...day, cells };
  });

  return { ...base, days };
}

function applyDragToState(
  prev: AgendaData,
  drag: ScheduledDragData,
  drop: DropData,
  deltaMs: number,
  timezone: string
): AgendaData {
  const { entry, sourceRoomId } = drag;
  const { roomId: targetRoomId, slotTime: targetSlot } = drop;

  const newStart = deltaMs !== 0 ? new Date(entry.startTime.getTime() + deltaMs) : entry.startTime;
  const newEnd = deltaMs !== 0 ? new Date(entry.endTime.getTime() + deltaMs) : entry.endTime;
  const newRoomIds = entry.roomIds.map((id) => (id === sourceRoomId ? targetRoomId : id));
  const updatedEntry: AgendaEntry = { ...entry, startTime: newStart, endTime: newEnd, roomIds: newRoomIds };

  const days = prev.days.map((day) => {
    const oldDateKey = getDateKeyInTimezone(entry.startTime, timezone);
    if (day.dateKey !== oldDateKey) return day;

    const cells = new Map(Array.from(day.cells.entries()).map(([rid, slotMap]) => [rid, new Map(slotMap)]));

    const oldSlotKey = entry.startTime.toISOString();
    const oldCol = cells.get(sourceRoomId);
    if (oldCol) {
      const existing = oldCol.get(oldSlotKey) ?? [];
      const filtered = existing.filter((e) => e.scheduleId !== entry.scheduleId);
      if (filtered.length === 0) oldCol.delete(oldSlotKey);
      else oldCol.set(oldSlotKey, filtered);
    }

    const newSlotKey = (deltaMs !== 0 ? targetSlot : entry.startTime).toISOString();
    if (!cells.has(targetRoomId)) cells.set(targetRoomId, new Map());
    const newCol = cells.get(targetRoomId)!;
    const existing = newCol.get(newSlotKey) ?? [];
    newCol.set(newSlotKey, [...existing, updatedEntry]);

    return { ...day, cells };
  });

  return { ...prev, days };
}
