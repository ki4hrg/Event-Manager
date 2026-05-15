"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type DayOption = { value: string; label: string };
type RoomOption = { value: string; label: string; groupId: string | null; groupName: string | null; groupSortOrder: number };

type ReportFiltersProps = {
  eventId: string;
  days: DayOption[];
  rooms: RoomOption[];
  selectedDays: string[];
  selectedRoomIds: string[];
  basePath?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

type RoomGroupBucket = {
  groupId: string | null;
  label: string;
  sortOrder: number;
  rooms: RoomOption[];
};

function groupRoomOptions(rooms: RoomOption[]): RoomGroupBucket[] {
  const buckets = new Map<string, RoomGroupBucket>();
  for (const room of rooms) {
    const key = room.groupId ?? "__ungrouped__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        groupId: room.groupId,
        label: room.groupName ?? "Ungrouped",
        sortOrder: room.groupSortOrder,
        rooms: [],
      });
    }
    buckets.get(key)!.rooms.push(room);
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

function toggleFilter(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function ReportFilters({
  eventId,
  days,
  rooms,
  selectedDays,
  selectedRoomIds,
  basePath = `/events/${eventId}/reports/room-schedule`,
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  function pushWith(key: "days" | "rooms", next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set(key, next.join(","));
    } else {
      params.delete(key);
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function toggleDay(value: string) {
    pushWith("days", toggleFilter(selectedDays, value));
  }

  function toggleRoom(value: string) {
    pushWith("rooms", toggleFilter(selectedRoomIds, value));
  }

  function toggleGroup(groupRoomIds: string[], allActive: boolean) {
    const next = allActive
      ? selectedRoomIds.filter((id) => !groupRoomIds.includes(id))
      : Array.from(new Set([...selectedRoomIds, ...groupRoomIds]));
    pushWith("rooms", next);
  }

  function clearFilters() {
    router.push(basePath);
  }

  const roomBuckets = useMemo(() => groupRoomOptions(rooms), [rooms]);
  const hasMultipleGroups = roomBuckets.filter((b) => b.groupId !== null).length > 0;

  const hasFilters = selectedDays.length > 0 || selectedRoomIds.length > 0;
  const filterCount = selectedDays.length + selectedRoomIds.length;

  const actions = (
    <>
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Clear filters
        </button>
      )}
      {shareButton}
      {!hidePrint && (
        <a
          href={`${basePath}/print${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          Print / Save PDF
        </a>
      )}
    </>
  );

  const filterChips = (
    <>
      {rooms.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Rooms</p>
          <div className="space-y-2">
            {roomBuckets.map((bucket) => {
              const bucketIds = bucket.rooms.map((r) => r.value);
              const allActive = bucketIds.every((id) => selectedRoomIds.includes(id));
              const someActive = bucketIds.some((id) => selectedRoomIds.includes(id));
              return (
                <div key={bucket.groupId ?? "__ungrouped__"} className="flex flex-wrap items-center gap-2">
                  {hasMultipleGroups && (
                    <button
                      onClick={() => toggleGroup(bucketIds, allActive)}
                      className={`px-2.5 py-1 text-xs font-medium uppercase tracking-wide rounded border transition-colors ${
                        allActive
                          ? "bg-blue-600 border-blue-600 text-white"
                          : someActive
                            ? "border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300"
                            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400"
                      }`}
                      title={allActive ? `Clear ${bucket.label}` : `Select all in ${bucket.label}`}
                    >
                      {bucket.label}
                    </button>
                  )}
                  {bucket.rooms.map((r) => {
                    const active = selectedRoomIds.includes(r.value);
                    return (
                      <button
                        key={r.value}
                        onClick={() => toggleRoom(r.value)}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                          active
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {days.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Day</p>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => {
              const active = selectedDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    active
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="print:hidden mb-6">
      <div className="sm:hidden">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"
          >
            <span aria-hidden>{filtersOpen ? "▾" : "▸"}</span>
            <span>{filtersOpen ? "Hide filters" : "Show filters"}</span>
            {filterCount > 0 && (
              <span className="ml-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                {filterCount}
              </span>
            )}
          </button>
          <div className="ml-auto flex items-center gap-3">{actions}</div>
        </div>
        {filtersOpen && (
          <div className="flex flex-wrap items-start gap-6">{filterChips}</div>
        )}
      </div>

      <div className="hidden sm:flex flex-wrap items-start gap-6">
        {filterChips}
        <div className="flex items-end gap-3 ml-auto">{actions}</div>
      </div>
    </div>
  );
}
