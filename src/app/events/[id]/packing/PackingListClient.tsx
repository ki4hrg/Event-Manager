"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import {
  ACQUISITION_LABEL,
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
} from "@/lib/statusConstants";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import { labelMicroCaps } from "@/lib/reportStyles";
import { PackingProcurementWarning } from "@/components/PackingProcurementWarning";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";
import { PackingSubstatusSelect, type PackingSubstatusOption } from "@/components/ui/PackingSubstatusSelect";
import type { PackableItem, PackingListPayload } from "../../packing/actions";
import type { ReturnToLocationResult } from "../../packing/core";
import { isUserError, type UserError } from "@/lib/userErrors";

// An omitted sub-state is cleared when the status changes.
type ToggleSupply = (itemId: string, supplyOrderId: string, status: PackingStatus, substatus?: string | null) => Promise<void>;
type TogglePrint = (itemId: string, printOrderId: string, status: PackingStatus, substatus?: string | null) => Promise<void>;
type ToggleSupplyAcquisition = (
  itemId: string,
  supplyOrderId: string,
  state: AcquisitionState,
) => Promise<void>;
type TogglePrintAcquisition = (
  itemId: string,
  printOrderId: string,
  state: AcquisitionState,
) => Promise<void>;

const NEXT_STATUS: Record<PackingStatus, PackingStatus> = {
  NEEDED: "IN_TRANSIT",
  IN_TRANSIT: "DELIVERED",
  DELIVERED: "NEEDED",
};

const VALID_STATES = new Set<AcquisitionState>(["ON_HAND", "TO_PROCURE", "DROP_SHIP"]);

function compareByDescription(a: PackableItem, b: PackableItem) {
  return a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
}

const PROVIDER_UNASSIGNED = "__blank__";
const LOCATION_UNASSIGNED = "__blank__";

type GroupBy = "acquisition" | "location";

type Props = {
  eventId: string;
  payload: PackingListPayload;
  initialState?: string;
  initialHideHandled?: string;
  initialProvider?: string;
  initialLocation?: string;
  initialGroupBy?: string;
  packingSubstatusOptions: PackingSubstatusOption[];
  toggleSupplyItem: ToggleSupply;
  togglePrintItem: TogglePrint;
  toggleSupplyAcquisition: ToggleSupplyAcquisition;
  togglePrintAcquisition: TogglePrintAcquisition;
  saveProviderFilter: (value: string) => Promise<void>;
  saveLocationFilter: (value: string) => Promise<void>;
  returnItemsToLocation: (
    supplyItemIds: string[],
    targetLocationId: string,
  ) => Promise<ReturnToLocationResult | UserError>;
};

/**
 * Only loose supply items can be filed into storage. Print collateral is given
 * away rather than kept, and a container line *is* the box — filing it into a
 * location would make the box its own contents.
 */
function isFilable(item: PackableItem) {
  return item.kind === "SUPPLY" && item.containerLocationId == null;
}

function filableReason(item: PackableItem): string | undefined {
  if (item.kind === "PRINT") return "Print collateral not stored";
  if (item.containerLocationId != null) return "Container cannot be filed";
  return undefined;
}

export function PackingListClient({
  eventId,
  payload,
  initialState,
  initialHideHandled,
  initialProvider,
  initialLocation,
  initialGroupBy,
  packingSubstatusOptions,
  toggleSupplyItem,
  togglePrintItem,
  toggleSupplyAcquisition,
  togglePrintAcquisition,
  saveProviderFilter,
  saveLocationFilter,
  returnItemsToLocation,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = `/events/${eventId}/packing`;

  const stateFilter: AcquisitionState | null =
    initialState && VALID_STATES.has(initialState as AcquisitionState)
      ? (initialState as AcquisitionState)
      : null;
  const hideHandled = initialHideHandled === "1";

  const providerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of payload.items) if (item.provider) names.add(item.provider);
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [payload.items]);

  const hasUnassigned = useMemo(
    () => payload.items.some((i) => i.provider == null),
    [payload.items],
  );

  // Treat an unknown saved/URL value as "All" — happens when an event no longer
  // has items for the previously selected provider.
  const providerFilter: string =
    initialProvider === PROVIDER_UNASSIGNED
      ? hasUnassigned
        ? PROVIDER_UNASSIGNED
        : ""
      : initialProvider && providerOptions.includes(initialProvider)
        ? initialProvider
        : "";

  // If the URL says ?provider=X but X is no longer valid (the saved provider
  // is gone, or __blank__ with no unassigned items), drop the param so the
  // address bar matches the actually-applied filter. router.replace avoids
  // adding a history entry.
  useEffect(() => {
    if (initialProvider && initialProvider !== providerFilter) {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("provider")) {
        params.delete("provider");
        const qs = params.toString();
        router.replace(qs ? `${basePath}?${qs}` : basePath);
      }
    }
    // Run on mount and whenever the mismatch could change (initial value vs.
    // the validated set).
  }, [initialProvider, providerFilter, router, searchParams, basePath]);

  // Same validate-then-degrade shape as the provider filter: a location that no
  // longer holds anything falls back to "All" rather than emptying the list.
  const locationFilter: string =
    initialLocation && payload.locations.some((l) => l.id === initialLocation)
      ? initialLocation
      : "";

  useEffect(() => {
    if (initialLocation && initialLocation !== locationFilter) {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("location")) {
        params.delete("location");
        const qs = params.toString();
        router.replace(qs ? `${basePath}?${qs}` : basePath);
      }
    }
  }, [initialLocation, locationFilter, router, searchParams, basePath]);

  const groupBy: GroupBy = initialGroupBy === "location" ? "location" : "acquisition";

  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [isRefreshing, startRefresh] = useTransition();
  const isRefreshingRef = useRef(isRefreshing);
  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);

  // Update lastSyncedAt only when a transition actually completes, so the
  // staleness pill reflects "data arrived" rather than "refresh requested".
  const wasRefreshingRef = useRef(isRefreshing);
  useEffect(() => {
    if (wasRefreshingRef.current && !isRefreshing) {
      setLastSyncedAt(Date.now());
    }
    wasRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  // ── Live refresh ────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    startRefresh(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && !isRefreshingRef.current) {
        refresh();
      }
    };
    const id = setInterval(tick, 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // ── URL filter updates ──────────────────────────────────────────────────────
  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function setStateFilter(next: AcquisitionState | null) {
    pushWith({ state: next });
  }

  function setHideHandled(next: boolean) {
    pushWith({ hideHandled: next ? "1" : null });
  }

  // useTransition wraps the save so React tracks it as in-flight work, and
  // awaiting it before navigating keeps the persisted value durable: even if
  // the user closes the tab milliseconds after picking, the save has the
  // first head start. Errors propagate to Next's default handler.
  const [, startProviderSave] = useTransition();

  function setProvider(next: string) {
    startProviderSave(async () => {
      await saveProviderFilter(next);
      // "" means "All providers" → drop the URL param.
      pushWith({ provider: next === "" ? null : next });
    });
  }

  function setLocation(next: string) {
    startProviderSave(async () => {
      await saveLocationFilter(next);
      pushWith({ location: next === "" ? null : next });
    });
  }

  function setGroupBy(next: GroupBy) {
    pushWith({ groupBy: next === "acquisition" ? null : next });
  }

  function clearFilters() {
    setQ("");
    startProviderSave(async () => {
      await Promise.all([saveProviderFilter(""), saveLocationFilter("")]);
      pushWith({ state: null, hideHandled: null, provider: null, location: null });
    });
  }

  // ── Return to storage ───────────────────────────────────────────────────────
  // Post-event repack: file loose supply items back into a container so the next
  // event can pull from inventory instead of retyping.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [returnTarget, setReturnTarget] = useState("");
  const [returnResult, setReturnResult] = useState<ReturnToLocationResult | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [isReturning, startReturn] = useTransition();

  const canReturn = payload.canWriteSupply && payload.canWriteStorage;

  const returnOptions: LocationOption[] = useMemo(
    () =>
      payload.locations.map((l) => ({
        id: l.id,
        name: l.name,
        kind: l.isContainer ? "CONTAINER" : "PLACE",
        depth: l.depth,
        path: l.path,
        archived: false,
      })),
    [payload.locations],
  );

  function toggleSelected(itemId: string) {
    setReturnResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setReturnTarget("");
    setReturnError(null);
  }

  function applyReturn() {
    startReturn(async () => {
      setReturnError(null);
      try {
        const result = await returnItemsToLocation(Array.from(selected), returnTarget);
        if (isUserError(result)) {
          setReturnError(result.error);
          return;
        }
        setReturnResult(result);
        clearSelection();
        router.refresh();
      } catch (e) {
        setReturnError(e instanceof Error ? e.message : "Couldn't file those items.");
      }
    });
  }

  // ── Item cycle ──────────────────────────────────────────────────────────────
  // Use sets so rapid taps on different pills don't overwrite each other's
  // in-flight state. A finishing cycle only clears its own itemId.
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(() => new Set());
  const [errorItemIds, setErrorItemIds] = useState<Set<string>>(() => new Set());

  function fixAcquisition(item: PackableItem) {
    setPendingItemIds((s) => {
      const n = new Set(s);
      n.add(item.itemId);
      return n;
    });
    setErrorItemIds((s) => {
      if (!s.has(item.itemId)) return s;
      const n = new Set(s);
      n.delete(item.itemId);
      return n;
    });
    startRefresh(async () => {
      let failed = false;
      try {
        if (item.kind === "SUPPLY") {
          await toggleSupplyAcquisition(item.itemId, item.parentOrderId, "ON_HAND");
        } else {
          await togglePrintAcquisition(item.itemId, item.parentOrderId, "ON_HAND");
        }
        router.refresh();
      } catch {
        failed = true;
      } finally {
        setPendingItemIds((s) => {
          const n = new Set(s);
          n.delete(item.itemId);
          return n;
        });
        if (failed) {
          setErrorItemIds((s) => {
            const n = new Set(s);
            n.add(item.itemId);
            return n;
          });
        }
      }
    });
  }

  function cycle(item: PackableItem) {
    writePacking(item, NEXT_STATUS[item.packingStatus]);
  }

  function writePacking(item: PackableItem, next: PackingStatus, substatus?: string | null) {
    setPendingItemIds((s) => {
      const n = new Set(s);
      n.add(item.itemId);
      return n;
    });
    setErrorItemIds((s) => {
      if (!s.has(item.itemId)) return s;
      const n = new Set(s);
      n.delete(item.itemId);
      return n;
    });
    startRefresh(async () => {
      let failed = false;
      try {
        if (item.kind === "SUPPLY") {
          await toggleSupplyItem(item.itemId, item.parentOrderId, next, substatus);
        } else {
          await togglePrintItem(item.itemId, item.parentOrderId, next, substatus);
        }
        router.refresh();
      } catch {
        failed = true;
      } finally {
        setPendingItemIds((s) => {
          const n = new Set(s);
          n.delete(item.itemId);
          return n;
        });
        if (failed) {
          setErrorItemIds((s) => {
            const n = new Set(s);
            n.add(item.itemId);
            return n;
          });
        }
      }
    });
  }

  // ── Filter + group ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return payload.items.filter((item) => {
      if (stateFilter && item.acquisitionState !== stateFilter) return false;
      if (hideHandled && item.packingStatus !== "NEEDED") return false;
      if (providerFilter === PROVIDER_UNASSIGNED) {
        if (item.provider != null) return false;
      } else if (providerFilter !== "") {
        if (item.provider !== providerFilter) return false;
      }
      if (locationFilter === LOCATION_UNASSIGNED) {
        if (item.sourceLocationId != null) return false;
      } else if (locationFilter !== "") {
        // Filtering a pallet means everything nested under it, not just its
        // direct contents.
        const subtree = payload.locationSubtrees[locationFilter];
        if (!item.sourceLocationId) return false;
        if (subtree ? !subtree.includes(item.sourceLocationId) : item.sourceLocationId !== locationFilter) {
          return false;
        }
      }
      if (needle) {
        const hay =
          `${item.description} ${item.parentOrderName} ${item.provider ?? ""} ${item.sourceLocationName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [payload.items, payload.locationSubtrees, stateFilter, hideHandled, providerFilter, locationFilter, q]);

  const groups = useMemo(() => {
    const order: AcquisitionState[] = ["ON_HAND", "TO_PROCURE", "DROP_SHIP"];
    return order.map((state) => {
      const rows = filtered
        .filter((item) => item.acquisitionState === state)
        .sort(compareByDescription);
      // Totals come from the unfiltered set so the "x / y handled" counter
      // stays stable while filters move.
      const total = payload.items.filter((i) => i.acquisitionState === state).length;
      const packed = payload.items.filter(
        (i) => i.acquisitionState === state && i.packingStatus !== "NEEDED",
      ).length;
      return { state, rows, total, packed };
    });
  }, [filtered, payload.items]);

  // Location grouping: one section per location that actually holds something,
  // in tree order, plus a trailing bucket for items with no location.
  const locationGroups = useMemo(() => {
    const countsFor = (predicate: (item: PackableItem) => boolean) => ({
      total: payload.items.filter(predicate).length,
      packed: payload.items.filter((i) => predicate(i) && i.packingStatus !== "NEEDED").length,
    });

    const sections = payload.locations
      .map((location) => {
        const atLocation = (item: PackableItem) => item.sourceLocationId === location.id;
        return {
          key: location.id,
          label: location.name,
          path: location.path,
          depth: location.depth,
          isContainer: location.isContainer,
          rows: filtered.filter(atLocation).sort(compareByDescription),
          ...countsFor(atLocation),
        };
      })
      .filter((section) => section.total > 0);

    const unplaced = (item: PackableItem) => item.sourceLocationId == null;
    const unplacedCounts = countsFor(unplaced);
    if (unplacedCounts.total > 0) {
      sections.push({
        key: LOCATION_UNASSIGNED,
        label: "No location set",
        path: "",
        depth: 0,
        isContainer: false,
        rows: filtered.filter(unplaced).sort(compareByDescription),
        ...unplacedCounts,
      });
    }
    return sections;
  }, [filtered, payload.items, payload.locations]);

  const stalenessSeconds = Math.max(0, Math.floor((now - lastSyncedAt) / 1000));
  const stalenessDot =
    stalenessSeconds < 30
      ? "bg-green-500"
      : stalenessSeconds < 120
        ? "bg-amber-500"
        : "bg-red-500";
  const stalenessLabel =
    stalenessSeconds < 5
      ? "Updated just now"
      : stalenessSeconds < 60
        ? `Updated ${stalenessSeconds}s ago`
        : `Updated ${Math.floor(stalenessSeconds / 60)}m ago`;

  const hasFilters =
    stateFilter !== null || hideHandled || providerFilter !== "" || q.trim().length > 0;
  const filterCount =
    (stateFilter ? 1 : 0) +
    (hideHandled ? 1 : 0) +
    (providerFilter !== "" ? 1 : 0) +
    (q.trim() ? 1 : 0);

  const hiddenSliceNote: string | null = (() => {
    if (!payload.canSeeSupply && payload.canSeePrint) return "Supply items hidden";
    if (payload.canSeeSupply && !payload.canSeePrint) return "Print items hidden";
    return null;
  })();

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2 py-2">
          <input
            type="search"
            placeholder="Search items..."
            aria-label="Search items"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 min-w-[12rem] px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`sm:hidden ${btnOutlinedSm}`}
          >
            {filtersOpen ? "Hide filters" : `Filters${filterCount > 0 ? ` (${filterCount})` : ""}`}
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-2 ${btnOutlinedSm} disabled:opacity-50`}
            title="Refresh now"
          >
            <span className={`h-2 w-2 rounded-full ${stalenessDot}`} aria-hidden />
            <span className="hidden sm:inline">{stalenessLabel}</span>
            <span className="sm:hidden">Refresh</span>
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className={btnOutlinedSm}
            >
              Clear
            </button>
          )}
        </div>

        <div className={`${filtersOpen ? "flex" : "hidden"} sm:flex flex-wrap items-center gap-2 pb-2`}>
          <Chip
            active={stateFilter === null}
            onClick={() => setStateFilter(null)}
            label="All states"
          />
          <Chip
            active={stateFilter === "ON_HAND"}
            onClick={() => setStateFilter("ON_HAND")}
            label="On Hand"
          />
          <Chip
            active={stateFilter === "TO_PROCURE"}
            onClick={() => setStateFilter("TO_PROCURE")}
            label="To Procure"
          />
          <Chip
            active={stateFilter === "DROP_SHIP"}
            onClick={() => setStateFilter("DROP_SHIP")}
            label="Drop Ship"
          />
          <label className="flex max-w-full items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:ml-2">
            <input
              type="checkbox"
              checked={hideHandled}
              onChange={(e) => setHideHandled(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-700"
            />
            Hide handled
          </label>

          {(providerOptions.length > 0 || hasUnassigned) && (
            <label className="flex max-w-full items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:ml-2">
              <span>Provider</span>
              <select
                value={providerFilter}
                onChange={(e) => setProvider(e.target.value)}
                className="min-w-0 max-w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                {hasUnassigned && (
                  <option value={PROVIDER_UNASSIGNED}>Unassigned</option>
                )}
                {providerOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}

          {payload.locations.length > 0 && (
            <label className="flex max-w-full items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:ml-2">
              <span>Location</span>
              <select
                value={locationFilter}
                onChange={(e) => setLocation(e.target.value)}
                className="min-w-0 max-w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="">All</option>
                <option value={LOCATION_UNASSIGNED}>No location set</option>
                {payload.locations.map((l) => (
                  <option key={l.id} value={l.id} title={l.path}>
                    {`${"  ".repeat(l.depth)}${l.name}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {payload.locations.length > 0 && (
            <label className="flex max-w-full items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:ml-2">
              <span>Group by</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="min-w-0 max-w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="acquisition">Acquisition state</option>
                <option value="location">Location</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {hiddenSliceNote && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">{hiddenSliceNote}</p>
      )}

      {payload.items.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No items to pack.
        </p>
      )}

      {payload.items.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No items match the current filters.{" "}
          <button
            type="button"
            onClick={clearFilters}
            className="underline hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear filters
          </button>
        </p>
      )}

      {returnResult && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3 text-sm">
          <p className="text-gray-700 dark:text-gray-300">
            Filed {returnResult.created + returnResult.rehomed} item
            {returnResult.created + returnResult.rehomed === 1 ? "" : "s"} into{" "}
            {returnResult.locationName}
            {returnResult.rehomed > 0 && returnResult.created > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                {" "}
                ({returnResult.created} new, {returnResult.rehomed} moved)
              </span>
            )}
            .
          </p>
          {returnResult.skipped > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {returnResult.skipped} skipped.
              {returnResult.needCatalogued.length > 0 && (
                <>
                  {" "}
                  These need an equipment link first:{" "}
                  {returnResult.needCatalogued.join(", ")}
                  {returnResult.skipped > returnResult.needCatalogued.length && "…"}
                </>
              )}
            </p>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {selected.size} selected
            </span>
            <div className="min-w-56 flex-1">
              <LocationSelect
                options={returnOptions}
                value={returnTarget}
                onChange={setReturnTarget}
                placeholder="— Return to… —"
              />
            </div>
            <button
              type="button"
              disabled={isReturning || !returnTarget}
              onClick={applyReturn}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isReturning ? "..." : "File"}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              Clear selection
            </button>
          </div>
          {returnError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{returnError}</p>
          )}
        </div>
      )}

      {/* Groups */}
      {(groupBy === "acquisition"
        ? groups
            .filter((group) => !(stateFilter && group.state !== stateFilter))
            .filter((group) => group.total > 0)
            .map((group) => ({
              key: group.state as string,
              heading: ACQUISITION_LABEL[group.state],
              subheading: null as string | null,
              depth: 0,
              rows: group.rows,
              packed: group.packed,
              total: group.total,
            }))
        : locationGroups.map((section) => ({
            key: section.key,
            heading: section.label,
            subheading: section.path && section.depth > 0 ? section.path : null,
            depth: section.depth,
            rows: section.rows,
            packed: section.packed,
            total: section.total,
          }))
      ).map((group) => {
        return (
          <section
            key={group.key}
            className="space-y-2"
            style={groupBy === "location" ? { marginLeft: `${group.depth * 0.75}rem` } : undefined}
          >
            <div className="flex items-baseline justify-between border-b border-gray-200 dark:border-gray-800 pb-1 gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {group.heading}
                </h2>
                {group.subheading && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {group.subheading}
                  </p>
                )}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
                {group.packed} / {group.total} handled
              </span>
            </div>

            {group.rows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">No matches.</p>
            ) : (
              <>
                {/* Mobile cards */}
                <ul className="sm:hidden space-y-2">
                  {group.rows.map((item) => {
                    const canWriteItem =
                      item.kind === "SUPPLY" ? payload.canWriteSupply : payload.canWritePrint;
                    return (
                      <li
                        key={`${item.kind}-${item.itemId}`}
                        className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {canReturn && (
                            <input
                              type="checkbox"
                              checked={selected.has(item.itemId)}
                              disabled={!isFilable(item)}
                              onChange={() => toggleSelected(item.itemId)}
                              title={filableReason(item)}
                              aria-label={`Select ${item.description}`}
                              className="mt-1 rounded border-gray-300 dark:border-gray-600 disabled:opacity-40"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-medium break-words min-w-0 text-gray-900 dark:text-white">
                                {item.description}
                              </span>
                              {item.quantity != null && (
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  × {item.quantity}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <Link
                                href={item.parentOrderHref}
                                className="hover:underline"
                              >
                                {item.parentOrderName}
                              </Link>
                              {item.provider && <span> · {item.provider}</span>}
                              {item.equipmentCategory && <span> · {item.equipmentCategory}</span>}
                              {groupBy !== "location" && item.sourceLocationName && (
                                <span title={item.sourceLocationPath ?? undefined}>
                                  {" "}
                                  · {item.sourceLocationName}
                                </span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <StatusPill
                              item={item}
                              canWrite={canWriteItem}
                              isPending={pendingItemIds.has(item.itemId)}
                              hasError={errorItemIds.has(item.itemId)}
                              onCycle={cycle}
                            />
                            <PackingSubstatusSelect
                              status={item.packingStatus}
                              options={packingSubstatusOptions}
                              value={item.packingSubstatus}
                              disabled={!canWriteItem || pendingItemIds.has(item.itemId)}
                              onChange={(sub) => writePacking(item, item.packingStatus, sub)}
                              className="max-w-28 text-xs px-1.5 py-1"
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <PackingProcurementWarning
                            packingStatus={item.packingStatus}
                            acquisitionState={item.acquisitionState}
                            onFix={() => fixAcquisition(item)}
                            disabled={!canWriteItem}
                            isPending={pendingItemIds.has(item.itemId)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className={`text-left ${labelMicroCaps}`}>
                        {canReturn && <th className="py-2 pr-3 w-8"><span className="sr-only">Select</span></th>}
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3">Qty</th>
                        <th className="py-2 pr-3">Order</th>
                        <th className="py-2 pr-3">Provider</th>
                        <th className="py-2 pr-3">Category</th>
                        {/* Storage location; "Source" is already taken by acquisition state. */}
                        <th className="py-2 pr-3">Storage</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {group.rows.map((item) => {
                        const canWriteItem =
                          item.kind === "SUPPLY" ? payload.canWriteSupply : payload.canWritePrint;
                        return (
                        <tr key={`${item.kind}-${item.itemId}`} className="align-top">
                          {canReturn && (
                            <td className="py-2 pr-3">
                              <input
                                type="checkbox"
                                checked={selected.has(item.itemId)}
                                disabled={!isFilable(item)}
                                onChange={() => toggleSelected(item.itemId)}
                                title={filableReason(item)}
                                aria-label={`Select ${item.description}`}
                                className="mt-0.5 rounded border-gray-300 dark:border-gray-600 disabled:opacity-40"
                              />
                            </td>
                          )}
                          <td className="py-2 pr-3 text-gray-900 dark:text-white">
                            <div className="font-medium">{item.description}</div>
                            {item.notes && (
                              <div className="text-xs italic text-gray-500 dark:text-gray-400">
                                {item.notes}
                              </div>
                            )}
                            <div className="mt-1">
                              <PackingProcurementWarning
                                packingStatus={item.packingStatus}
                                acquisitionState={item.acquisitionState}
                                onFix={() => fixAcquisition(item)}
                                disabled={!canWriteItem}
                                isPending={pendingItemIds.has(item.itemId)}
                              />
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                            {item.quantity ?? "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <Link
                              href={item.parentOrderHref}
                              className="text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {item.parentOrderName}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                            {item.provider ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                            {item.equipmentCategory ?? "—"}
                          </td>
                          <td
                            className="py-2 pr-3 text-gray-700 dark:text-gray-300"
                            title={item.sourceLocationPath ?? undefined}
                          >
                            {item.sourceLocationName ?? "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill
                                item={item}
                                canWrite={canWriteItem}
                                isPending={pendingItemIds.has(item.itemId)}
                                hasError={errorItemIds.has(item.itemId)}
                                onCycle={cycle}
                              />
                              <PackingSubstatusSelect
                                status={item.packingStatus}
                                options={packingSubstatusOptions}
                                value={item.packingSubstatus}
                                disabled={!canWriteItem || pendingItemIds.has(item.itemId)}
                                onChange={(sub) => writePacking(item, item.packingStatus, sub)}
                                className="text-xs px-1.5 py-1"
                              />
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-full border ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {label}
    </button>
  );
}

function StatusPill({
  item,
  canWrite,
  isPending,
  hasError,
  onCycle,
}: {
  item: PackableItem;
  canWrite: boolean;
  isPending: boolean;
  hasError: boolean;
  onCycle: (item: PackableItem) => void;
}) {
  const next = NEXT_STATUS[item.packingStatus];
  const errorRing = hasError ? "ring-2 ring-red-500" : "";
  const ariaLabel = canWrite
    ? hasError
      ? `${PACKING_STATUS_LABEL[item.packingStatus]} — failed, retry ${PACKING_STATUS_LABEL[next]}`
      : `${PACKING_STATUS_LABEL[item.packingStatus]} — mark ${PACKING_STATUS_LABEL[next]}`
    : `${PACKING_STATUS_LABEL[item.packingStatus]} (read-only)`;
  const titleAttr = !canWrite
    ? "No permission"
    : hasError
      ? "Retry"
      : undefined;
  return (
    <button
      type="button"
      disabled={!canWrite || isPending}
      aria-label={ariaLabel}
      title={titleAttr}
      onClick={() => onCycle(item)}
      className={`min-h-11 min-w-24 px-4 py-2.5 rounded-full text-sm font-medium ${PACKING_STATUS_CLASS[item.packingStatus]} ${errorRing} ${
        isPending ? "opacity-60 cursor-wait" : ""
      } ${!canWrite ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {hasError ? "Retry?" : PACKING_STATUS_LABEL[item.packingStatus]}
    </button>
  );
}
