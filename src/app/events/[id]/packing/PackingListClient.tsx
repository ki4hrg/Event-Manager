"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import {
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
} from "@/lib/statusConstants";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import type { PackableItem, PackingListPayload } from "../../packing/actions";

type ToggleSupply = (itemId: string, supplyOrderId: string, status: PackingStatus) => Promise<void>;
type TogglePrint = (itemId: string, printOrderId: string, status: PackingStatus) => Promise<void>;

const NEXT_STATUS: Record<PackingStatus, PackingStatus> = {
  NEEDED: "PACKED",
  PACKED: "DELIVERED",
  DELIVERED: "NEEDED",
};

const ACQUISITION_LABEL: Record<AcquisitionState, string> = {
  ON_HAND: "On Hand",
  TO_PROCURE: "To Procure",
};

const VALID_STATES = new Set<AcquisitionState>(["ON_HAND", "TO_PROCURE"]);

function compareByDescription(a: PackableItem, b: PackableItem) {
  return a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
}

type Props = {
  eventId: string;
  payload: PackingListPayload;
  initialState?: string;
  initialHidePacked?: string;
  toggleSupplyItem: ToggleSupply;
  togglePrintItem: TogglePrint;
};

export function PackingListClient({
  eventId,
  payload,
  initialState,
  initialHidePacked,
  toggleSupplyItem,
  togglePrintItem,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = `/events/${eventId}/packing`;

  const stateFilter: AcquisitionState | null =
    initialState && VALID_STATES.has(initialState as AcquisitionState)
      ? (initialState as AcquisitionState)
      : null;
  const hidePacked = initialHidePacked === "1";

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

  function setHidePacked(next: boolean) {
    pushWith({ hidePacked: next ? "1" : null });
  }

  function clearFilters() {
    setQ("");
    pushWith({ state: null, hidePacked: null });
  }

  // ── Item cycle ──────────────────────────────────────────────────────────────
  // Use sets so rapid taps on different pills don't overwrite each other's
  // in-flight state. A finishing cycle only clears its own itemId.
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(() => new Set());
  const [errorItemIds, setErrorItemIds] = useState<Set<string>>(() => new Set());

  function cycle(item: PackableItem) {
    const next = NEXT_STATUS[item.packingStatus];
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
          await toggleSupplyItem(item.itemId, item.parentOrderId, next);
        } else {
          await togglePrintItem(item.itemId, item.parentOrderId, next);
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
      if (hidePacked && item.packingStatus !== "NEEDED") return false;
      if (needle) {
        const hay = `${item.description} ${item.parentOrderName} ${item.provider ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [payload.items, stateFilter, hidePacked, q]);

  const groups = useMemo(() => {
    const order: AcquisitionState[] = ["ON_HAND", "TO_PROCURE"];
    return order.map((state) => {
      const rows = filtered
        .filter((item) => item.acquisitionState === state)
        .sort(compareByDescription);
      const total = payload.items.filter((i) => i.acquisitionState === state).length;
      const packed = payload.items.filter(
        (i) => i.acquisitionState === state && i.packingStatus !== "NEEDED",
      ).length;
      return { state, rows, total, packed };
    });
  }, [filtered, payload.items]);

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

  const hasFilters = stateFilter !== null || hidePacked || q.trim().length > 0;
  const filterCount = (stateFilter ? 1 : 0) + (hidePacked ? 1 : 0) + (q.trim() ? 1 : 0);

  const hiddenSliceNote: string | null = (() => {
    if (!payload.canSeeSupply && payload.canSeePrint) return "Supply items hidden — you don't have access to supply orders.";
    if (payload.canSeeSupply && !payload.canSeePrint) return "Print items hidden — you don't have access to print orders.";
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
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
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
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 ml-2">
            <input
              type="checkbox"
              checked={hidePacked}
              onChange={(e) => setHidePacked(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-700"
            />
            Hide packed
          </label>
        </div>
      </div>

      {hiddenSliceNote && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">{hiddenSliceNote}</p>
      )}

      {payload.items.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No items to pack. Add supply or print items to an order to see them here.
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

      {/* Groups */}
      {groups.map((group) => {
        if (stateFilter && group.state !== stateFilter) return null;
        if (group.total === 0) return null;
        return (
          <section key={group.state} className="space-y-2">
            <div className="flex items-baseline justify-between border-b border-gray-200 dark:border-gray-800 pb-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {ACQUISITION_LABEL[group.state]}
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {group.packed} / {group.total} packed
              </span>
            </div>

            {group.rows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">No matches.</p>
            ) : (
              <>
                {/* Mobile cards */}
                <ul className="sm:hidden space-y-2">
                  {group.rows.map((item) => (
                    <li
                      key={`${item.kind}-${item.itemId}`}
                      className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-white">
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
                          </div>
                          {item.notes && (
                            <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <StatusPill
                          item={item}
                          canWrite={item.kind === "SUPPLY" ? payload.canWriteSupply : payload.canWritePrint}
                          isPending={pendingItemIds.has(item.itemId)}
                          hasError={errorItemIds.has(item.itemId)}
                          onCycle={cycle}
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3">Qty</th>
                        <th className="py-2 pr-3">Order</th>
                        <th className="py-2 pr-3">Provider</th>
                        <th className="py-2 pr-3">Category</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {group.rows.map((item) => (
                        <tr key={`${item.kind}-${item.itemId}`}>
                          <td className="py-2 pr-3 text-gray-900 dark:text-white">
                            <div className="font-medium">{item.description}</div>
                            {item.notes && (
                              <div className="text-xs italic text-gray-500 dark:text-gray-400">
                                {item.notes}
                              </div>
                            )}
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
                          <td className="py-2 pr-3">
                            <StatusPill
                              item={item}
                              canWrite={item.kind === "SUPPLY" ? payload.canWriteSupply : payload.canWritePrint}
                              isPending={pendingItemIds.has(item.itemId)}
                              hasError={errorItemIds.has(item.itemId)}
                              onCycle={cycle}
                            />
                          </td>
                        </tr>
                      ))}
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
      ? `Status: ${PACKING_STATUS_LABEL[item.packingStatus]}. Last update failed — tap to retry to ${PACKING_STATUS_LABEL[next]}.`
      : `Status: ${PACKING_STATUS_LABEL[item.packingStatus]}. Tap to mark ${PACKING_STATUS_LABEL[next]}.`
    : `Status: ${PACKING_STATUS_LABEL[item.packingStatus]} (read-only)`;
  const titleAttr = !canWrite
    ? "You don't have permission to change this item's status."
    : hasError
      ? "Last update failed. Tap to retry."
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
