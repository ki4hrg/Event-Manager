"use client";

import { useMemo } from "react";
import { FilterBucketChip, FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type DayOption = { value: string; label: string };
type RoomOption = { value: string; label: string; groupId: string | null; groupName: string | null; groupSortOrder: number };

type ReportFiltersProps = {
  eventId: string;
  days: DayOption[];
  rooms: RoomOption[];
  selectedDays: string[];
  selectedRoomIds: string[];
  usedOnly: boolean;
  basePath?: string;
  paramPrefix?: string;
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

export function ReportFilters({
  eventId,
  days,
  rooms,
  selectedDays,
  selectedRoomIds,
  usedOnly,
  basePath = `/events/${eventId}/reports/room-schedule`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  const roomBuckets = useMemo(() => groupRoomOptions(rooms), [rooms]);
  const hasMultipleGroups = roomBuckets.filter((b) => b.groupId !== null).length > 0;

  return (
    <ReportFilterShell
      activeCount={selectedDays.length + selectedRoomIds.length + (usedOnly ? 1 : 0)}
      onClear={() => filter.clear(["days", "rooms", "usedOnly"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      {rooms.length > 1 && (
        <FilterGroup label="Rooms" className="space-y-2">
          {roomBuckets.map((bucket) => {
            const bucketIds = bucket.rooms.map((r) => r.value);
            const allActive = bucketIds.every((id) => selectedRoomIds.includes(id));
            const someActive = bucketIds.some((id) => selectedRoomIds.includes(id));
            return (
              <div key={bucket.groupId ?? "__ungrouped__"} className="flex flex-wrap items-center gap-2">
                {hasMultipleGroups && (
                  <FilterBucketChip
                    label={bucket.label}
                    allActive={allActive}
                    someActive={someActive}
                    onClick={() => filter.toggleAll("rooms", selectedRoomIds, bucketIds, allActive)}
                  />
                )}
                {bucket.rooms.map((r) => (
                  <FilterChip
                    key={r.value}
                    active={selectedRoomIds.includes(r.value)}
                    onClick={() => filter.toggle("rooms", selectedRoomIds, r.value)}
                  >
                    {r.label}
                  </FilterChip>
                ))}
              </div>
            );
          })}
        </FilterGroup>
      )}

      <FilterGroup label="Show">
        <FilterChip active={usedOnly} onClick={() => filter.setFlag("usedOnly", !usedOnly)}>
          Used rooms only
        </FilterChip>
      </FilterGroup>

      {days.length > 1 && (
        <FilterGroup label="Day">
          {days.map((d) => (
            <FilterChip
              key={d.value}
              active={selectedDays.includes(d.value)}
              onClick={() => filter.toggle("days", selectedDays, d.value)}
            >
              {d.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
    </ReportFilterShell>
  );
}
