"use client";

import { useState, useMemo } from "react";
import { btnPrimarySm } from "@/lib/buttonStyles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption } from "@prisma/client";
import type { getScheduleItems } from "./actions";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { EmptyState } from "@/components/EmptyState";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { colorClasses } from "@/lib/colors";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type ScheduleItemRow = Awaited<ReturnType<typeof getScheduleItems>>[number];

type Props = {
  items: ScheduleItemRow[];
  eventId: string;
  scheduleTypes: CustomOption[];
  timezone: string;
  deleteScheduleItem: (formData: FormData) => Promise<void>;
  deleteScheduleItems: (ids: string[]) => Promise<void>;
  bulkUpdateScheduleItems: (ids: string[], updates: { type?: string; isPublic?: boolean }) => Promise<void>;
};

type SortField = "startTime" | "endTime" | "type" | "function" | "isPublic";

type FilterState = { search: string; type: string; isPublic: string };
const DEFAULT_FILTERS: FilterState = { search: "", type: "", isPublic: "" };

function formatDT(date: Date, timezone: string): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(date: Date, timezone: string): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameDay(a: Date, b: Date, timezone: string): boolean {
  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString("en-CA", { timeZone: timezone });
  return fmt(a) === fmt(b);
}

export function ScheduleItemList({
  items,
  eventId,
  scheduleTypes,
  timezone,
  deleteScheduleItem,
  deleteScheduleItems,
  bulkUpdateScheduleItems,
}: Props) {
  const canWrite = useCanWrite("FUNCTIONS");
  const canDelete = useCanDelete("FUNCTIONS");
  const canSelect = canWrite || canDelete;
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("table");
  const [sortField, setSortField] = useState<SortField>("startTime");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkType, setBulkType] = useState("");
  const [bulkIsPublic, setBulkIsPublic] = useState("");

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const fnName = (item.function.name || item.function.type || "").toLowerCase();
        const typeLabel = resolveOptionLabel(item.type, scheduleTypes).toLowerCase();
        const notes = (item.notes || "").toLowerCase();
        if (!fnName.includes(q) && !typeLabel.includes(q) && !notes.includes(q)) return false;
      }
      if (filters.type && item.type !== filters.type) return false;
      if (filters.isPublic === "true" && !item.isPublic) return false;
      if (filters.isPublic === "false" && item.isPublic) return false;
      return true;
    });
  }, [items, filters, scheduleTypes]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "startTime": return compareValues(a.startTime, b.startTime, sortDir);
        case "endTime": return compareValues(a.endTime, b.endTime, sortDir);
        case "type": return compareValues(
          resolveOptionLabel(a.type, scheduleTypes),
          resolveOptionLabel(b.type, scheduleTypes),
          sortDir
        );
        case "function": return compareValues(
          a.function.name || a.function.type || "",
          b.function.name || b.function.type || "",
          sortDir
        );
        case "isPublic": return compareValues(
          a.isPublic ? 1 : 0,
          b.isPublic ? 1 : 0,
          sortDir
        );
        default: return 0;
      }
    });
  }, [filtered, sortField, sortDir, scheduleTypes]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  const allFilteredIds = sorted.map((i) => i.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allFilteredIds.forEach((id) => next.delete(id));
      else allFilteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} schedule item${ids.length !== 1 ? "s" : ""}?`)) return;
    await deleteScheduleItems(ids);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkApply() {
    const ids = Array.from(selected);
    const updates: { type?: string; isPublic?: boolean } = {};
    if (bulkType) updates.type = bulkType;
    if (bulkIsPublic === "true") updates.isPublic = true;
    else if (bulkIsPublic === "false") updates.isPublic = false;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdateScheduleItems(ids, updates);
    setSelected(new Set());
    setShowBulkEdit(false);
    setBulkType("");
    setBulkIsPublic("");
    router.refresh();
  }

  const thBase = "px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900";
  const thSortable = `${thBase} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none`;
  const filterCell = "px-2 py-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700";
  const filterInput = "w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white";

  function functionLabel(item: ScheduleItemRow) {
    return item.function.name || item.function.type || "Unnamed Function";
  }

  function formatRange(item: ScheduleItemRow) {
    const start = formatDT(item.startTime, timezone);
    if (isSameDay(item.startTime, item.endTime, timezone)) {
      return `${start} – ${formatTime(item.endTime, timezone)}`;
    }
    return `${start} – ${formatDT(item.endTime, timezone)}`;
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {items.length} schedule item{items.length !== 1 ? "s" : ""}
          </p>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {/* Selection bar */}
      {canSelect && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm">
          <span className="font-medium text-blue-700 dark:text-blue-300">
            {selected.size} selected
          </span>
          {canWrite && (
            <button
              onClick={() => setShowBulkEdit((v) => !v)}
              className="rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/40"
            >
              {showBulkEdit ? "Hide bulk edit" : "Bulk edit"}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleBulkDelete}
              className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete selected
            </button>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Bulk edit panel */}
      {canWrite && showBulkEdit && selected.size > 0 && (
        <div className="mb-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
            >
              <option value="">(no change)</option>
              {scheduleTypes.map((t) => (
                <option key={t.id} value={t.label}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Public</label>
            <select
              value={bulkIsPublic}
              onChange={(e) => setBulkIsPublic(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
            >
              <option value="">(no change)</option>
              <option value="true">Public</option>
              <option value="false">Private</option>
            </select>
          </div>
          <button
            onClick={handleBulkApply}
            className={btnPrimarySm}
          >
            Apply
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState message="No schedule items yet. Add schedule items to functions to see them here." />
      ) : view === "list" ? (
        <div className="space-y-2">
          {sorted.map((item) => {
            const color = resolveOptionColor(item.type, scheduleTypes);
            const label = resolveOptionLabel(item.type, scheduleTypes);
            return (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {canSelect && (
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleRow(item.id)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClasses[color] ?? colorClasses.gray}`}
                      >
                        {label || item.type}
                      </span>
                      {item.isPublic && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">Public</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{formatRange(item)}</p>
                    <Link
                      href={`/events/${eventId}/functions/${item.function.id}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {functionLabel(item)}
                    </Link>
                    {item.notes && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.notes}</p>
                    )}
                  </div>
                </div>
                <InlineDeleteButton
                  resource="FUNCTIONS"
                  action={deleteScheduleItem}
                  hiddenInputs={{ scheduleItemId: item.id }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  {canSelect && (
                    <th className={`${thBase} w-8`}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400"
                      />
                    </th>
                  )}
                  <th className={thSortable} onClick={() => handleSort("startTime")}>
                    Date / Time{sortIndicator(sortField === "startTime", sortDir)}
                  </th>
                  <th className={thSortable} onClick={() => handleSort("type")}>
                    Type{sortIndicator(sortField === "type", sortDir)}
                  </th>
                  <th className={thSortable} onClick={() => handleSort("function")}>
                    Function{sortIndicator(sortField === "function", sortDir)}
                  </th>
                  <th className={thSortable} onClick={() => handleSort("isPublic")}>
                    Public{sortIndicator(sortField === "isPublic", sortDir)}
                  </th>
                  <th className={thBase}>Notes</th>
                  <th className={thBase}></th>
                </tr>
                {/* Filter row */}
                <tr>
                  {/* Spacer under the select-all column; drops with it. */}
                  {canSelect && <td className={filterCell} />}
                  <td className={filterCell} />
                  <td className={filterCell}>
                    <select
                      value={filters.type}
                      onChange={(e) => setFilter("type", e.target.value)}
                      className={filterInput}
                    >
                      <option value="">All types</option>
                      {scheduleTypes.map((t) => (
                        <option key={t.id} value={t.label}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className={filterCell}>
                    <input
                      type="text"
                      placeholder="Search…"
                      value={filters.search}
                      onChange={(e) => setFilter("search", e.target.value)}
                      className={filterInput}
                    />
                  </td>
                  <td className={filterCell}>
                    <select
                      value={filters.isPublic}
                      onChange={(e) => setFilter("isPublic", e.target.value)}
                      className={filterInput}
                    >
                      <option value="">All</option>
                      <option value="true">Public</option>
                      <option value="false">Private</option>
                    </select>
                  </td>
                  <td className={filterCell} />
                  <td className={filterCell} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={canSelect ? 7 : 6} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No schedule items match the current filters.
                    </td>
                  </tr>
                ) : (
                  sorted.map((item) => {
                    const color = resolveOptionColor(item.type, scheduleTypes);
                    const label = resolveOptionLabel(item.type, scheduleTypes);
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                          selected.has(item.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""
                        }`}
                      >
                        {canSelect && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggleRow(item.id)}
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatRange(item)}
                        </td>
                        <td className="px-3 py-2">
                          {item.type ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClasses[color] ?? colorClasses.gray}`}
                            >
                              {label || item.type}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <Link
                            href={`/events/${eventId}/functions/${item.function.id}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {functionLabel(item)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {item.isPublic && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">Public</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {item.notes || ""}
                        </td>
                        <td className="px-3 py-2">
                          <InlineDeleteButton
                            resource="FUNCTIONS"
                            action={deleteScheduleItem}
                            hiddenInputs={{ scheduleItemId: item.id }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
