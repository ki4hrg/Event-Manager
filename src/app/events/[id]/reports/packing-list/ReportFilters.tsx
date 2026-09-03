"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ACQUISITION_OPTIONS, PACKING_STATUS_OPTIONS } from "@/lib/statusConstants";

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

function toggleFilter(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

const chipBase = "px-3 py-1 text-sm rounded-full border transition-colors";
const chipOn = "bg-blue-600 border-blue-600 text-white";
const chipOff =
  "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const roomsKey = `${paramPrefix}rooms`;
  const packingKey = `${paramPrefix}packing`;
  const acquisitionKey = `${paramPrefix}acquisition`;
  const providersKey = `${paramPrefix}providers`;
  const hidePackedKey = `${paramPrefix}hidePacked`;

  function push(params: URLSearchParams) {
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function pushWith(key: string, next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set(key, next.join(","));
    } else {
      params.delete(key);
    }
    push(params);
  }

  function toggleHidePacked() {
    const params = new URLSearchParams(searchParams.toString());
    if (hidePacked) {
      params.delete(hidePackedKey);
    } else {
      params.set(hidePackedKey, "true");
    }
    push(params);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of [roomsKey, packingKey, acquisitionKey, providersKey, hidePackedKey]) {
      params.delete(key);
    }
    push(params);
  }

  const roomBuckets = useMemo(() => groupRoomOptions(rooms), [rooms]);
  const hasNamedGroups = roomBuckets.some((b) => b.groupId !== "__ungrouped__");

  const filterCount =
    selectedRoomIds.length +
    selectedPackingStatuses.length +
    selectedAcquisitionStates.length +
    selectedProviders.length +
    (hidePacked ? 1 : 0);
  const hasFilters = filterCount > 0;

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
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Room</p>
          <div className="space-y-2">
            {roomBuckets.map((bucket) => {
              const bucketIds = bucket.rooms.map((r) => r.value);
              const allActive = bucketIds.every((id) => selectedRoomIds.includes(id));
              const someActive = bucketIds.some((id) => selectedRoomIds.includes(id));
              return (
                <div key={bucket.groupId} className="flex flex-wrap items-center gap-2">
                  {hasNamedGroups && (
                    <button
                      onClick={() =>
                        pushWith(
                          roomsKey,
                          allActive
                            ? selectedRoomIds.filter((id) => !bucketIds.includes(id))
                            : Array.from(new Set([...selectedRoomIds, ...bucketIds]))
                        )
                      }
                      className={`px-2.5 py-1 text-xs font-medium uppercase tracking-wide rounded border transition-colors ${
                        allActive
                          ? chipOn
                          : someActive
                            ? "border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300"
                            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400"
                      }`}
                      title={allActive ? `Clear ${bucket.label}` : `Select all in ${bucket.label}`}
                    >
                      {bucket.label}
                    </button>
                  )}
                  {bucket.rooms.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => pushWith(roomsKey, toggleFilter(selectedRoomIds, r.value))}
                      className={`${chipBase} ${selectedRoomIds.includes(r.value) ? chipOn : chipOff}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Packing status</p>
        <div className="flex flex-wrap gap-2">
          {PACKING_STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => pushWith(packingKey, toggleFilter(selectedPackingStatuses, o.value))}
              className={`${chipBase} ${selectedPackingStatuses.includes(o.value) ? chipOn : chipOff}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Acquisition</p>
        <div className="flex flex-wrap gap-2">
          {ACQUISITION_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() =>
                pushWith(acquisitionKey, toggleFilter(selectedAcquisitionStates, o.value))
              }
              className={`${chipBase} ${selectedAcquisitionStates.includes(o.value) ? chipOn : chipOff}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {providers.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Provider</p>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.value}
                onClick={() => pushWith(providersKey, toggleFilter(selectedProviders, p.value))}
                className={`${chipBase} ${selectedProviders.includes(p.value) ? chipOn : chipOff}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Show</p>
        <button
          onClick={toggleHidePacked}
          className={`${chipBase} ${hidePacked ? chipOn : chipOff}`}
          title="Hide items already in transit or delivered"
        >
          Hide packed
        </button>
      </div>
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
        {filtersOpen && <div className="flex flex-wrap items-start gap-6">{filterChips}</div>}
      </div>

      <div className="hidden sm:flex flex-wrap items-start gap-6">
        {filterChips}
        <div className="flex items-end gap-3 ml-auto">{actions}</div>
      </div>
    </div>
  );
}
