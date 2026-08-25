"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
  getFullDayRoomIds,
  getDateKeyInTimezone,
  findSlotKeyForEntry,
  SLOT_INTERVAL_MS,
} from "@/lib/agendaUtils";
import { groupRoomsByGroup } from "@/lib/roomGroups";
import { updateFunctionRoom, rescheduleEntry, scheduleUnscheduledFunction } from "@/app/events/functions/actions";
import type { RoomConflict } from "@/lib/conflicts";
import { ConflictWarning } from "@/components/ConflictWarning";
import { toTitleCase } from "@/lib/optionUtils";
import { DateTabs } from "./DateTabs";
import { AgendaViewOptions, type AgendaViewSettings } from "./AgendaViewOptions";
import { DEFAULT_AGENDA_VIEW_SETTINGS, type AgendaRoomPrefs } from "@/lib/userSettings";
import { saveAgendaRoomPrefs } from "./actions";

type AgendaGridProps = {
  eventId: string;
  agendaData: SerializedAgendaData;
  timezone: string;
  activeDate: string | null;
  initialSettings?: AgendaViewSettings;
  initialRoomPrefs?: AgendaRoomPrefs;
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
  dayStart: Date;
  dayEnd: Date;
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
const MIN_ROOM_COL_PX = 200;
const TIME_COL_PX = 96; // w-24

// TODO: Extract shared color class maps to src/lib/colorUtils.ts — duplicated in
// ScheduleList.tsx, FunctionList.tsx, PresentationList.tsx, and OptionList.tsx
const entryColorClasses: Record<string, { bg: string; title: string; text: string; handle: string; handleHover: string }> = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-950",     title: "text-blue-700 dark:text-blue-300",     text: "text-blue-500 dark:text-blue-400",     handle: "bg-blue-300 dark:bg-blue-600", handleHover: "group-hover/handle:bg-blue-500 dark:group-hover/handle:bg-blue-400" },
  red:    { bg: "bg-red-50 dark:bg-red-950",        title: "text-red-700 dark:text-red-300",       text: "text-red-500 dark:text-red-400",       handle: "bg-red-300 dark:bg-red-600",   handleHover: "group-hover/handle:bg-red-500 dark:group-hover/handle:bg-red-400" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950",  title: "text-orange-700 dark:text-orange-300", text: "text-orange-500 dark:text-orange-400", handle: "bg-orange-300 dark:bg-orange-600", handleHover: "group-hover/handle:bg-orange-500 dark:group-hover/handle:bg-orange-400" },
  yellow: { bg: "bg-yellow-50 dark:bg-yellow-950",  title: "text-yellow-700 dark:text-yellow-300", text: "text-yellow-600 dark:text-yellow-400", handle: "bg-yellow-300 dark:bg-yellow-600", handleHover: "group-hover/handle:bg-yellow-500 dark:group-hover/handle:bg-yellow-400" },
  green:  { bg: "bg-green-50 dark:bg-green-950",    title: "text-green-700 dark:text-green-300",   text: "text-green-500 dark:text-green-400",   handle: "bg-green-300 dark:bg-green-600", handleHover: "group-hover/handle:bg-green-500 dark:group-hover/handle:bg-green-400" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950",  title: "text-purple-700 dark:text-purple-300", text: "text-purple-500 dark:text-purple-400", handle: "bg-purple-300 dark:bg-purple-600", handleHover: "group-hover/handle:bg-purple-500 dark:group-hover/handle:bg-purple-400" },
  pink:   { bg: "bg-pink-50 dark:bg-pink-950",      title: "text-pink-700 dark:text-pink-300",     text: "text-pink-500 dark:text-pink-400",     handle: "bg-pink-300 dark:bg-pink-600", handleHover: "group-hover/handle:bg-pink-500 dark:group-hover/handle:bg-pink-400" },
  gray:   { bg: "bg-gray-50 dark:bg-gray-800",      title: "text-gray-700 dark:text-gray-300",     text: "text-gray-500 dark:text-gray-400",     handle: "bg-gray-300 dark:bg-gray-600", handleHover: "group-hover/handle:bg-gray-500 dark:group-hover/handle:bg-gray-400" },
};

function getEntryColors(entry: AgendaEntry) {
  return entryColorClasses[entry.scheduleTypeColor ?? "blue"] ?? entryColorClasses.blue;
}

function EntryContent({
  entry,
  eventId,
  timezone,
}: {
  entry: AgendaEntry;
  eventId: string;
  timezone: string;
}) {
  const typeDisplay = toTitleCase(entry.scheduleTypeLabel || entry.scheduleType);
  const colors = getEntryColors(entry);
  return (
    <div className="px-1.5 pt-3 pb-1 text-xs h-full">
      <div className="sticky top-10">
        {entry.isBreakout && entry.breakoutGroupName && (
          <div className={`${colors.text} opacity-75 leading-tight text-[10px] uppercase tracking-wide`}>
            {entry.breakoutGroupName}
          </div>
        )}
        <div className={`font-medium ${colors.title} leading-tight line-clamp-2 break-words`}>
          {entry.functionName}
        </div>
        <div className={`${colors.text} leading-tight mt-0.5 truncate`}>
          {formatTime(entry.startTime, timezone)} –{" "}
          {formatTime(entry.endTime, timezone)}
          {!entry.isBreakout && entry.scheduleType && entry.scheduleType !== "MAIN" && (
            <span className="ml-1 opacity-75">· {typeDisplay}</span>
          )}
        </div>
        {entry.scheduleNotes && (
          <div className={`${colors.text} leading-tight mt-0.5 italic`}>
            {entry.scheduleNotes}
          </div>
        )}
        {!entry.isBreakout && entry.presentationTitles.length > 0 && (
          <div className={`${colors.text} opacity-75 leading-tight mt-0.5 line-clamp-2`}>
            {entry.presentationTitles.join(", ")}
          </div>
        )}
        {entry.offSiteLocation && (
          <div className={`${colors.text} opacity-75 leading-tight mt-0.5 text-[10px] italic`}>
            {entry.offSiteLocation}
          </div>
        )}
        {entry.functionDescription && entry.presentationTitles.length === 0 && !entry.isBreakout && (
          <div className={`${colors.text} opacity-75 leading-tight mt-0.5 line-clamp-2`}>
            {entry.functionDescription}
          </div>
        )}
      </div>
    </div>
  );
}

function ResizeHandle({
  position,
  onPointerDown,
  colors,
}: {
  position: "top" | "bottom";
  onPointerDown: (e: React.PointerEvent) => void;
  colors: (typeof entryColorClasses)[string];
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
      <div className={`w-8 h-1 rounded-full ${colors.handle} opacity-0 group-hover/card:opacity-100 ${colors.handleHover} transition-all`} />
    </div>
  );
}

function DraggableCard({
  entry,
  sourceRoomId,
  eventId,
  timezone,
  onResizeStart,
  slotTime,
  rowspan,
  columnIndex = 0,
  columnCount = 1,
}: {
  entry: AgendaEntry;
  sourceRoomId: string;
  eventId: string;
  timezone: string;
  onResizeStart: OnResizeStart;
  slotTime: Date;
  rowspan: number;
  columnIndex?: number;
  columnCount?: number;
}) {
  const router = useRouter();
  const draggedRef = useRef(false);
  const isSegment = !!entry.originalStartTime;
  const isOffSite = sourceRoomId === "__offsite__";
  const isDragDisabled = isSegment || entry.isBreakout || isOffSite;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${entry.scheduleId}:${sourceRoomId}`,
    data: { entry, sourceRoomId } satisfies DragData,
    disabled: isDragDisabled,
  });

  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const showTopHandle = !entry.isBreakout && (!isSegment || entry.segmentPosition === "first");
  const showBottomHandle = !entry.isBreakout && (!isSegment || entry.segmentPosition === "last");

  // Sub-slot precision: offset top/bottom when entry doesn't align to slot boundaries
  const slotMs = slotTime.getTime();
  const totalMs = rowspan * SLOT_INTERVAL_MS;
  const topOffset = Math.max(0, entry.startTime.getTime() - slotMs);
  const bottomOffset = Math.max(0, (slotMs + totalMs) - entry.endTime.getTime());
  const topPct = (topOffset / totalMs) * 100;
  const bottomPct = (bottomOffset / totalMs) * 100;

  // Side-by-side layout for overlapping entries
  const colWidthPct = 100 / columnCount;
  const colLeftPct = columnIndex * colWidthPct;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        position: "absolute",
        top: `${topPct}%`,
        bottom: `${bottomPct}%`,
        left: `${colLeftPct}%`,
        width: `${colWidthPct}%`,
      }}
      title={entry.functionName}
      className={`relative group/card overflow-hidden ${getEntryColors(entry).bg}${isDragDisabled ? " cursor-pointer" : " cursor-grab active:cursor-grabbing"}${isDragging ? " opacity-40" : ""}`}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        if (entry.isBreakout) {
          router.push(`/events/${eventId}/breakout-schedule`);
        } else {
          router.push(`/events/${eventId}/functions/${entry.functionId}`);
        }
      }}
      {...(isDragDisabled ? {} : { ...listeners, ...attributes })}
    >
      {showTopHandle && (
        <ResizeHandle
          position="top"
          onPointerDown={(e) => onResizeStart(e, entry, sourceRoomId, "start")}
          colors={getEntryColors(entry)}
        />
      )}
      <EntryContent entry={entry} eventId={eventId} timezone={timezone} />
      {showBottomHandle && (
        <ResizeHandle
          position="bottom"
          onPointerDown={(e) => onResizeStart(e, entry, sourceRoomId, "end")}
          colors={getEntryColors(entry)}
        />
      )}
    </div>
  );
}

function DroppableCell({
  roomId,
  slotTime,
  rowSpan,
  children,
  isEmpty,
  disabled = false,
}: {
  roomId: string;
  slotTime: Date;
  rowSpan?: number;
  children?: React.ReactNode;
  isEmpty: boolean;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${roomId}:${slotTime.toISOString()}`,
    data: { roomId, slotTime } satisfies DropData,
    disabled,
  });

  const base = "border border-gray-200 dark:border-gray-700 align-top p-0";
  const bg = isOver
    ? "bg-blue-50 dark:bg-blue-950"
    : "bg-white dark:bg-gray-900";

  return (
    <td ref={setNodeRef} rowSpan={rowSpan} data-room-id={roomId} className={`${base} ${bg} relative`} style={{ height: "1px" }}>
      {children}
    </td>
  );
}

function DayGrid({
  day,
  rooms,
  eventId,
  timezone,
  viewSettings,
  onResizeStart,
}: {
  day: AgendaData["days"][number];
  rooms: AgendaData["rooms"];
  eventId: string;
  timezone: string;
  viewSettings: AgendaViewSettings;
  onResizeStart: OnResizeStart;
}) {
  const usedIds = getUsedRoomIds(day);
  const fullDayIds = getFullDayRoomIds(day);
  const visibleRooms = rooms.filter((r) => {
    if (r.id === "__offsite__") return true; // always show off-site column when present
    if (!viewSettings.showUnusedRooms && !usedIds.has(r.id)) return false;
    if (!viewSettings.showFullDayRooms && fullDayIds.has(r.id)) return false;
    return true;
  });

  type EntriesCell = { type: "entries"; entries: AgendaEntry[]; rowspan: number; slotTime: Date };
  type CellRender = { type: "skip" } | { type: "empty"; slotTime: Date } | EntriesCell;

  type SkipState = { remaining: number; cell: EntriesCell };
  const skipMap = new Map<string, SkipState>();

  let rowData: Array<{ slotTime: Date; cells: CellRender[] }> = [];

  for (const slot of day.timeSlots) {
    const slotKey = slot.toISOString();
    const cells: CellRender[] = [];

    for (const room of visibleRooms) {
      const skip = skipMap.get(room.id);
      if (skip && skip.remaining > 0) {
        // Check if any new entries start in this skipped slot — merge them into the parent cell.
        const newEntries = day.cells.get(room.id)?.get(slotKey) ?? [];
        if (newEntries.length > 0) {
          const prevMaxSpan = skip.cell.rowspan;
          for (const e of newEntries) skip.cell.entries.push(e);
          // Only compute rowspan for new entries; old entries' rowspan is already tracked.
          const newMaxSpan = Math.max(
            prevMaxSpan,
            ...newEntries.map((e) => computeRowspan(e, day.timeSlots))
          );
          if (newMaxSpan > prevMaxSpan) {
            skip.cell.rowspan = newMaxSpan;
            skip.remaining += newMaxSpan - prevMaxSpan;
          }
        }
        skip.remaining -= 1;
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
        const cell: EntriesCell = { type: "entries", entries: [...entries], rowspan: maxSpan, slotTime: slot };
        if (maxSpan > 1) {
          skipMap.set(room.id, { remaining: maxSpan - 1, cell });
        }
        cells.push(cell);
      }
    }

    rowData.push({ slotTime: slot, cells });
  }

  let sliceStart = 0;
  if (viewSettings.collapseEmptyHours && day.timeSlots.length > 0) {
    const BUFFER = 2;
    const dayMidnightMs = day.timeSlots[0].getTime();
    const nextMidnightMs = day.timeSlots[day.timeSlots.length - 1].getTime() + SLOT_INTERVAL_MS;

    let earliestStart = Infinity;
    let latestEnd = -Infinity;
    for (const room of visibleRooms) {
      const col = day.cells.get(room.id);
      if (!col) continue;
      col.forEach((entries) => {
        for (const entry of entries) {
          const startMs = entry.startTime.getTime();
          const endMs = entry.endTime.getTime();
          if (startMs > dayMidnightMs && startMs < earliestStart) earliestStart = startMs;
          if (endMs < nextMidnightMs && endMs > latestEnd) latestEnd = endMs;
        }
      });
    }

    if (earliestStart < Infinity) {
      const firstIdx = Math.max(0, day.timeSlots.findLastIndex(s => s.getTime() <= earliestStart) - BUFFER);
      const lastIdx = latestEnd > -Infinity
        ? Math.min(rowData.length - 1, day.timeSlots.findLastIndex(s => s.getTime() < latestEnd) + BUFFER)
        : rowData.length - 1;
      sliceStart = firstIdx;
      rowData = rowData.slice(firstIdx, lastIdx + 1);

      // Orphaned skip cells (rowspan origin sliced away) return null in React,
      // shifting subsequent columns left — convert them to empty cells instead.
      if (firstIdx > 0) {
        const openedRooms = new Set<string>();
        for (const row of rowData) {
          for (let ci = 0; ci < row.cells.length; ci++) {
            const cell = row.cells[ci];
            if (cell.type === "entries") {
              openedRooms.add(visibleRooms[ci].id);
            } else if (cell.type === "skip" && !openedRooms.has(visibleRooms[ci].id)) {
              row.cells[ci] = { type: "empty", slotTime: row.slotTime };
            }
          }
        }
      }
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (!scrollRef.current || hasScrolled.current) return;
    const rows = scrollRef.current.querySelectorAll("tbody tr");
    const targetRow = rows[Math.max(0, day.scrollToSlotIndex - sliceStart)];
    if (targetRow) {
      scrollRef.current.scrollTop = (targetRow as HTMLElement).offsetTop;
    }
    hasScrolled.current = true;
  }, [day.scrollToSlotIndex, sliceStart]);

  // Reset scroll tracking when day changes
  useEffect(() => {
    hasScrolled.current = false;
  }, [day.dateKey]);

  if (day.timeSlots.length === 0 || visibleRooms.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No scheduled functions for this day.
      </p>
    );
  }

  const tableMinWidth = TIME_COL_PX + MIN_ROOM_COL_PX * visibleRooms.length;

  return (
    <div ref={scrollRef} className="overflow-auto max-h-[80vh]">
      <table className="w-full border-collapse text-sm table-fixed" style={{ minWidth: tableMinWidth }}>
        <colgroup>
          <col style={{ width: TIME_COL_PX }} />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr className="bg-gray-50 dark:bg-gray-800">
            <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap bg-gray-50 dark:bg-gray-800 sticky left-0 z-30">
              Time
            </th>
            {visibleRooms.map((room) => (
              <th
                key={room.id}
                data-room-id={room.id}
                className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left font-medium text-gray-900 dark:text-white whitespace-nowrap bg-gray-50 dark:bg-gray-800"
              >
                {room.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowData.map(({ slotTime, cells }) => (
            <tr key={slotTime.toISOString()} className="h-14">
              <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap align-top font-medium sticky left-0 z-10 bg-white dark:bg-gray-900">
                {formatTime(slotTime, timezone)}
              </td>
              {cells.map((cell, i) => {
                if (cell.type === "skip") return null;
                const room = visibleRooms[i];
                const isOffSiteCol = room.id === "__offsite__";
                if (cell.type === "empty") {
                  return (
                    <DroppableCell
                      key={room.id}
                      roomId={room.id}
                      slotTime={cell.slotTime}
                      isEmpty={true}
                      disabled={isOffSiteCol}
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
                    disabled={isOffSiteCol}
                  >
                    {cell.entries.map((entry, colIdx) => (
                      <DraggableCard
                        key={entry.scheduleId}
                        entry={entry}
                        sourceRoomId={room.id}
                        eventId={eventId}
                        timezone={timezone}
                        onResizeStart={onResizeStart}
                        slotTime={cell.slotTime}
                        rowspan={cell.rowspan}
                        columnIndex={colIdx}
                        columnCount={cell.entries.length}
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
  const colors = getEntryColors(entry);
  return (
    <div className={`${colors.bg} border border-gray-300 dark:border-gray-600 rounded shadow-lg opacity-90 w-48`}>
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
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
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

function SortableRoomRow({
  room,
  isHidden,
  groupLabel,
  onToggle,
}: {
  room: AgendaData["rooms"][number];
  isHidden: boolean;
  groupLabel: string | null;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: room.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2"
    >
      <button
        {...listeners}
        {...attributes}
        tabIndex={-1}
        className="touch-none cursor-grab active:cursor-grabbing px-1 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
        aria-label="Drag to reorder"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2.5" r="1.2" /><circle cx="8" cy="2.5" r="1.2" />
          <circle cx="2" cy="7" r="1.2" /><circle cx="8" cy="7" r="1.2" />
          <circle cx="2" cy="11.5" r="1.2" /><circle cx="8" cy="11.5" r="1.2" />
        </svg>
      </button>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={!isHidden}
          onChange={onToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
        />
        <span className={`truncate ${isHidden ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>
          {room.name}
        </span>
        {groupLabel && (
          <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 shrink-0">
            {groupLabel}
          </span>
        )}
      </label>
    </div>
  );
}

function RoomPanel({
  orderedRooms,
  hiddenRoomIds,
  isDefault,
  onToggle,
  onToggleAll,
  onSetGroupVisible,
  onReorder,
  onReset,
}: {
  orderedRooms: AgendaData["rooms"];
  hiddenRoomIds: Set<string>;
  isDefault: boolean;
  onToggle: (roomId: string) => void;
  onToggleAll: (show: boolean) => void;
  onSetGroupVisible: (roomIds: string[], show: boolean) => void;
  onReorder: (newIds: string[]) => void;
  onReset: () => void;
}) {
  const allVisible = hiddenRoomIds.size === 0;
  const noneVisible = hiddenRoomIds.size === orderedRooms.length;
  const checkAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkAllRef.current) {
      checkAllRef.current.indeterminate = !allVisible && !noneVisible;
    }
  }, [allVisible, noneVisible]);

  const roomBuckets = useMemo(
    () => groupRoomsByGroup(orderedRooms.filter((r) => r.id !== "__offsite__")),
    [orderedRooms]
  );
  const groupBuckets = roomBuckets.filter((b) => b.groupId !== null && b.rooms.length > 1);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedRooms.findIndex((r) => r.id === active.id);
    const newIdx = orderedRooms.findIndex((r) => r.id === over.id);
    onReorder(arrayMove(orderedRooms.map((r) => r.id), oldIdx, newIdx));
  }

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            ref={checkAllRef}
            type="checkbox"
            checked={allVisible}
            onChange={(e) => onToggleAll(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
          />
          Room columns
        </label>
        {!isDefault && (
          <button onClick={onReset} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Reset to default
          </button>
        )}
      </div>
      {groupBuckets.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 pb-2 border-b border-gray-200 dark:border-gray-700">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 self-center mr-1">
            Groups:
          </span>
          {groupBuckets.map((bucket) => {
            const ids = bucket.rooms.map((r) => r.id);
            const allShown = ids.every((id) => !hiddenRoomIds.has(id));
            const someShown = ids.some((id) => !hiddenRoomIds.has(id));
            const state: "all" | "some" | "none" = allShown ? "all" : someShown ? "some" : "none";
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => onSetGroupVisible(ids, !allShown)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  state === "all"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : state === "some"
                      ? "border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400"
                }`}
                title={allShown ? `Hide all in ${bucket.label}` : `Show all in ${bucket.label}`}
              >
                {bucket.label}
              </button>
            );
          })}
        </div>
      )}
      <DndContext id="room-panel-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedRooms.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {orderedRooms.map((room) => {
              const groupName = (room as AgendaData["rooms"][number] & { group?: { name: string } | null }).group?.name ?? null;
              return (
                <SortableRoomRow
                  key={room.id}
                  room={room}
                  isHidden={hiddenRoomIds.has(room.id)}
                  groupLabel={groupName}
                  onToggle={() => onToggle(room.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function AgendaGrid({
  eventId,
  agendaData: serializedData,
  timezone,
  activeDate,
  initialSettings,
  initialRoomPrefs,
}: AgendaGridProps) {
  const router = useRouter();
  const [agendaData, setAgendaData] = useState<AgendaData>(() => deserializeAgendaData(serializedData));
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewSettings, setViewSettings] = useState<AgendaViewSettings>(
    initialSettings ?? DEFAULT_AGENDA_VIEW_SETTINGS
  );
  const [conflictPending, setConflictPending] = useState<{
    conflicts: RoomConflict[];
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [hiddenRoomIds, setHiddenRoomIds] = useState<Set<string>>(
    () => new Set(initialRoomPrefs?.hiddenRoomIds ?? [])
  );
  const [roomOrder, setRoomOrder] = useState<string[]>(
    () => initialRoomPrefs?.roomOrder ?? []
  );
  const [showRoomPanel, setShowRoomPanel] = useState(false);

  // Always-current ref so callbacks can snapshot state without stale closures
  const agendaDataRef = useRef(agendaData);
  useLayoutEffect(() => { agendaDataRef.current = agendaData; });

  const { days, rooms, unscheduled } = agendaData;

  const allOrderedRooms = useMemo<AgendaData["rooms"]>(() => {
    if (roomOrder.length === 0) return rooms;
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const inOrder = roomOrder.flatMap((id) => { const r = roomMap.get(id); return r ? [r] : []; });
    const extra = rooms.filter((r) => !roomOrder.includes(r.id));
    return [...inOrder, ...extra];
  }, [rooms, roomOrder]);

  const displayRooms = useMemo<AgendaData["rooms"]>(
    () => allOrderedRooms.filter((r) => !hiddenRoomIds.has(r.id)),
    [allOrderedRooms, hiddenRoomIds]
  );

  function persistRoomPrefs(hidden: Set<string>, order: string[]) {
    saveAgendaRoomPrefs(eventId, { hiddenRoomIds: Array.from(hidden), roomOrder: order });
  }

  function handleToggleRoom(roomId: string) {
    setHiddenRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      persistRoomPrefs(next, roomOrder);
      return next;
    });
  }

  function handleReorderRooms(newIds: string[]) {
    setRoomOrder(newIds);
    persistRoomPrefs(hiddenRoomIds, newIds);
  }

  function handleToggleAllRooms(show: boolean) {
    const next = show ? new Set<string>() : new Set(rooms.map((r) => r.id));
    setHiddenRoomIds(next);
    persistRoomPrefs(next, roomOrder);
  }

  function handleSetGroupVisible(roomIds: string[], show: boolean) {
    setHiddenRoomIds((prev) => {
      const next = new Set(prev);
      for (const id of roomIds) {
        if (show) next.delete(id);
        else next.add(id);
      }
      persistRoomPrefs(next, roomOrder);
      return next;
    });
  }

  function handleResetRooms() {
    setHiddenRoomIds(new Set());
    setRoomOrder([]);
    persistRoomPrefs(new Set(), []);
  }
  const resolvedDate = activeDate ?? days[0]?.dateKey ?? null;
  const activeDay = days.find((d) => d.dateKey === resolvedDate) ?? days[0];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleResizeStart = useCallback<OnResizeStart>(
    (e, entry, roomId, type) => {
      setErrorMsg(null);
      const data = agendaDataRef.current;
      const day = data.days.find((d) => d.dateKey === resolvedDate) ?? data.days[0];
      const slots = day?.timeSlots;
      const dayStart = slots?.[0] ?? entry.startTime;
      const dayEnd = slots?.length
        ? new Date(slots[slots.length - 1].getTime() + SLOT_INTERVAL_MS)
        : entry.endTime;
      setResizing({
        entry,
        roomId,
        type,
        startY: e.clientY,
        originalStart: entry.startTime,
        originalEnd: entry.endTime,
        dayStart,
        dayEnd,
        snapshot: data,
      });
    },
    [resolvedDate]
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

      // For multi-day segments, send the full schedule range with only the
      // resized end adjusted — the other end comes from the original entry.
      let commitStart = newStart;
      let commitEnd = newEnd;
      if (entry.segmentPosition === "first" && entry.originalEndTime) {
        commitEnd = entry.originalEndTime;
      } else if (entry.segmentPosition === "last" && entry.originalStartTime) {
        commitStart = entry.originalStartTime;
      }

      const result = await rescheduleEntry(
        entry.scheduleId,
        entry.functionId,
        commitStart.toISOString(),
        commitEnd.toISOString(),
        eventId
      );
      if (!result.success) {
        if (result.conflicts?.length) {
          setConflictPending({
            conflicts: result.conflicts,
            onConfirm: async () => {
              const forced = await rescheduleEntry(
                entry.scheduleId,
                entry.functionId,
                commitStart.toISOString(),
                commitEnd.toISOString(),
                eventId,
                true
              );
              if (!forced.success) {
                setAgendaData(snapshot);
                setErrorMsg(forced.error ?? "Failed to resize.");
              } else {
                router.refresh();
              }
            },
          });
        } else {
          setAgendaData(snapshot);
          setErrorMsg(result.error ?? "Failed to resize.");
        }
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
          if (result.conflicts?.length) {
            setConflictPending({
              conflicts: result.conflicts,
              onConfirm: async () => {
                const forced = await scheduleUnscheduledFunction(
                  functionId,
                  roomId,
                  slotTime.toISOString(),
                  endTime.toISOString(),
                  eventId,
                  true
                );
                if (!forced.success) {
                  setErrorMsg(forced.error ?? "Failed to schedule.");
                } else {
                  router.refresh();
                }
              },
            });
          } else {
            setErrorMsg(result.error ?? "Failed to schedule.");
          }
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

      // Check for time conflicts before committing room change
      if (timeChanged) {
        const reschedResult = await rescheduleEntry(
          entry.scheduleId,
          entry.functionId,
          newStart.toISOString(),
          newEnd.toISOString(),
          eventId
        );
        if (!reschedResult.success) {
          setAgendaData(snapshot);
          if (reschedResult.conflicts?.length) {
            setConflictPending({
              conflicts: reschedResult.conflicts,
              onConfirm: async () => {
                const ops: Promise<{ success: boolean; error?: string }>[] = [];
                if (roomChanged) {
                  ops.push(updateFunctionRoom(entry.functionId, sourceRoomId, targetRoomId, eventId));
                }
                ops.push(
                  rescheduleEntry(entry.scheduleId, entry.functionId, newStart.toISOString(), newEnd.toISOString(), eventId, true)
                );
                const results = await Promise.all(ops);
                const failed = results.find((r) => !r.success);
                if (failed) {
                  setErrorMsg(failed.error ?? "Failed to save change.");
                } else {
                  router.refresh();
                }
              },
            });
          } else {
            setErrorMsg(reschedResult.error ?? "Failed to reschedule.");
          }
          return;
        }
        if (roomChanged) {
          const roomResult = await updateFunctionRoom(entry.functionId, sourceRoomId, targetRoomId, eventId);
          if (!roomResult.success) {
            setAgendaData(snapshot);
            setErrorMsg(roomResult.error ?? "Failed to save change.");
            return;
          }
        }
        router.refresh();
        return;
      }

      if (roomChanged) {
        const roomResult = await updateFunctionRoom(entry.functionId, sourceRoomId, targetRoomId, eventId);
        if (!roomResult.success) {
          setAgendaData(snapshot);
          setErrorMsg(roomResult.error ?? "Failed to save change.");
          return;
        }
        router.refresh();
      }
    },
    [eventId, timezone, router]
  );

  return (
    <DndContext id="agenda-dnd" sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div>
        {errorMsg && (
          <div className="mb-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded px-3 py-2">
            {errorMsg}
          </div>
        )}

        {conflictPending && (
          <div className="mb-4">
            <ConflictWarning
              conflicts={conflictPending.conflicts}
              timezone={timezone}
              onCancel={() => setConflictPending(null)}
              onConfirm={async () => {
                const action = conflictPending.onConfirm;
                setConflictPending(null);
                await action();
              }}
            />
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

        {rooms.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4 gap-4">
              {days.length > 0 && (
                <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">
                  {resolvedDate ? formatDateHeading(resolvedDate, timezone) : ""}
                </h2>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <button
                  onClick={() => setShowRoomPanel((v) => !v)}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Rooms{displayRooms.length < rooms.length ? ` (${displayRooms.length}/${rooms.length})` : ""}
                </button>
                <AgendaViewOptions settings={viewSettings} onChange={setViewSettings} />
              </div>
            </div>
            {showRoomPanel && (
              <RoomPanel
                orderedRooms={allOrderedRooms}
                hiddenRoomIds={hiddenRoomIds}
                isDefault={hiddenRoomIds.size === 0 && roomOrder.length === 0}
                onToggle={handleToggleRoom}
                onToggleAll={handleToggleAllRooms}
                onSetGroupVisible={handleSetGroupVisible}
                onReorder={handleReorderRooms}
                onReset={handleResetRooms}
              />
            )}
          </div>
        )}

        {activeDay && (
          <DayGrid
            day={activeDay}
            rooms={displayRooms}
            eventId={eventId}
            timezone={timezone}
            viewSettings={viewSettings}
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
    const clamped = rawEnd > state.dayEnd ? state.dayEnd : rawEnd < minEnd ? minEnd : rawEnd;
    return { newStart: state.originalStart, newEnd: clamped };
  } else {
    const rawStart = new Date(state.originalStart.getTime() + slotDelta * SLOT_INTERVAL_MS);
    const maxStart = new Date(state.originalEnd.getTime() - SLOT_INTERVAL_MS);
    const clamped = rawStart < state.dayStart ? state.dayStart : rawStart > maxStart ? maxStart : rawStart;
    return { newStart: clamped, newEnd: state.originalEnd };
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

    const oldKey = findSlotKeyForEntry(col, entry.scheduleId);
    if (oldKey) {
      const filtered = col.get(oldKey)!.filter((e) => e.scheduleId !== entry.scheduleId);
      if (filtered.length === 0) col.delete(oldKey);
      else col.set(oldKey, filtered);
    }

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

    const oldCol = cells.get(sourceRoomId);
    if (oldCol) {
      const oldSlotKey = findSlotKeyForEntry(oldCol, entry.scheduleId);
      if (oldSlotKey) {
        const filtered = oldCol.get(oldSlotKey)!.filter((e) => e.scheduleId !== entry.scheduleId);
        if (filtered.length === 0) oldCol.delete(oldSlotKey);
        else oldCol.set(oldSlotKey, filtered);
      }
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
