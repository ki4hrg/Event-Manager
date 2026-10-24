"use client";

import { useMemo } from "react";
import { ACQUISITION_OPTIONS, PACKING_STATUS_OPTIONS } from "@/lib/statusConstants";
import { FilterBucketChip, FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type RoomOption = {
  value: string;
  label: string;
  groupName: string | null;
  groupSortOrder: number;
};

type ProviderOption = { value: string; label: string };

type ReportFiltersProps = {
  eventId: string;
  rooms: RoomOption[];
  providers: ProviderOption[];
  selectedRoomIds: string[];
  selectedPackingStatuses: string[];
  selectedAcquisitionStates: string[];
  selectedProviders: string[];
  hidePacked: boolean;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

type RoomGroupBucket = {
  groupId: string;
  label: string;
  sortOrder: number;
  rooms: RoomOption[];
};

function groupRoomOptions(rooms: RoomOption[]): RoomGroupBucket[] {
  const buckets = new Map<string, RoomGroupBucket>();
  for (const room of rooms) {
    const key = room.groupName ?? "__ungrouped__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        groupId: key,
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
  rooms,
  providers,
  selectedRoomIds,
  selectedPackingStatuses,
  selectedAcquisitionStates,
  selectedProviders,
  hidePacked,
  basePath = `/events/${eventId}/reports/packing-list`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  const roomBuckets = useMemo(() => groupRoomOptions(rooms), [rooms]);
  const hasNamedGroups = roomBuckets.some((b) => b.groupId !== "__ungrouped__");

  const filterCount =
    selectedRoomIds.length +
    selectedPackingStatuses.length +
    selectedAcquisitionStates.length +
    selectedProviders.length +
    (hidePacked ? 1 : 0);

  return (
    <ReportFilterShell
      activeCount={filterCount}
      onClear={() => filter.clear(["rooms", "packing", "acquisition", "providers", "hidePacked"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      {rooms.length > 1 && (
        <FilterGroup label="Room" className="space-y-2">
          {roomBuckets.map((bucket) => {
            const bucketIds = bucket.rooms.map((r) => r.value);
            const allActive = bucketIds.every((id) => selectedRoomIds.includes(id));
            const someActive = bucketIds.some((id) => selectedRoomIds.includes(id));
            return (
              <div key={bucket.groupId} className="flex flex-wrap items-center gap-2">
                {hasNamedGroups && (
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

      <FilterGroup label="Packing status">
        {PACKING_STATUS_OPTIONS.map((o) => (
          <FilterChip
            key={o.value}
            active={selectedPackingStatuses.includes(o.value)}
            onClick={() => filter.toggle("packing", selectedPackingStatuses, o.value)}
          >
            {o.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Acquisition">
        {ACQUISITION_OPTIONS.map((o) => (
          <FilterChip
            key={o.value}
            active={selectedAcquisitionStates.includes(o.value)}
            onClick={() => filter.toggle("acquisition", selectedAcquisitionStates, o.value)}
          >
            {o.label}
          </FilterChip>
        ))}
      </FilterGroup>

      {providers.length > 1 && (
        <FilterGroup label="Provider">
          {providers.map((p) => (
            <FilterChip
              key={p.value}
              active={selectedProviders.includes(p.value)}
              onClick={() => filter.toggle("providers", selectedProviders, p.value)}
            >
              {p.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Show">
        <FilterChip active={hidePacked} onClick={() => filter.setFlag("hidePacked", !hidePacked)}>
          Hide packed
        </FilterChip>
      </FilterGroup>
    </ReportFilterShell>
  );
}
