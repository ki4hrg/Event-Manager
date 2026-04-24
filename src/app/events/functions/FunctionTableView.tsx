"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption } from "@prisma/client";
import type { FunctionForTable } from "./actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { colorClasses } from "@/lib/colors";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { getEarliestStart, getLatestEnd, formatScheduleDateTime } from "./scheduleUtils";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { getSetupOrderDisplayName } from "../setup-orders/utils";

type SortField = "name" | "earliestStart" | "latestEnd" | "type" | "rooms";

type FilterState = {
  name: string;
  dateFrom: string;
  dateTo: string;
  type: string;
  room: string;
  contacts: string;
  av: "" | "yes" | "no";
  setup: "" | "yes" | "no";
  catering: "" | "yes" | "no";
  workflow: "" | "none" | "in_progress" | "done";
};

const DEFAULT_FILTERS: FilterState = {
  name: "", dateFrom: "", dateTo: "", type: "", room: "", contacts: "",
  av: "", setup: "", catering: "", workflow: "",
};

type Props = {
  functions: FunctionForTable[];
  eventId: string;
  timezone: string;
  functionTypes: CustomOption[];
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  deleteFunctions: (ids: string[]) => Promise<void>;
};

function workflowStatus(summary: WorkflowBadgeSummary | undefined): "none" | "in_progress" | "done" {
  if (!summary || summary.count === 0 || summary.total === 0) return "none";
  if (summary.done === summary.total) return "done";
  return "in_progress";
}

function OrderFilter({
  value,
  onChange,
  className,
}: {
  value: "" | "yes" | "no";
  onChange: (v: "" | "yes" | "no") => void;
  className: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as "" | "yes" | "no")} className={className}>
      <option value="">All</option>
      <option value="yes">Has</option>
      <option value="no">None</option>
    </select>
  );
}

export function FunctionTableView({
  functions,
  eventId,
  timezone,
  functionTypes,
  workflowSummaries,
  deleteFunctions,
}: Props) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("earliestStart");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const allRooms = useMemo(() => {
    const names = new Set<string>();
    functions.forEach((fn) => fn.rooms.forEach((r) => names.add(r.room.name)));
    return Array.from(names).sort();
  }, [functions]);

  const scheduleBounds = useMemo(() => {
    const map = new Map<string, { earliest: Date | null; latest: Date | null }>();
    functions.forEach((fn) => {
      map.set(fn.id, { earliest: getEarliestStart(fn), latest: getLatestEnd(fn) });
    });
    return map;
  }, [functions]);

  const filtered = useMemo(() => {
    return functions.filter((fn) => {
      if (filters.name && !fn.name.toLowerCase().includes(filters.name.toLowerCase())) return false;

      const { earliest } = scheduleBounds.get(fn.id)!;
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom + "T00:00:00");
        if (!earliest || earliest < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo + "T23:59:59");
        if (!earliest || earliest > to) return false;
      }

      if (filters.type && fn.type !== filters.type) return false;

      if (filters.room && !fn.rooms.some((r) => r.room.name === filters.room)) return false;

      if (filters.contacts) {
        const query = filters.contacts.toLowerCase();
        const hasContact = fn.contacts.some((c) =>
          `${c.contact.firstName} ${c.contact.lastName}`.toLowerCase().includes(query)
        );
        if (!hasContact) return false;
      }

      if (filters.av === "yes" && !fn.avOrder) return false;
      if (filters.av === "no" && fn.avOrder) return false;

      if (filters.setup === "yes" && !fn.setupOrder) return false;
      if (filters.setup === "no" && fn.setupOrder) return false;

      if (filters.catering === "yes" && !fn.cateringOrder) return false;
      if (filters.catering === "no" && fn.cateringOrder) return false;

      if (filters.workflow) {
        if (workflowStatus(workflowSummaries[fn.id]) !== filters.workflow) return false;
      }

      return true;
    });
  }, [functions, filters, scheduleBounds, workflowSummaries]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name":
          return compareValues(a.name, b.name, sortDir);
        case "earliestStart":
          return compareValues(scheduleBounds.get(a.id)!.earliest, scheduleBounds.get(b.id)!.earliest, sortDir);
        case "latestEnd":
          return compareValues(scheduleBounds.get(a.id)!.latest, scheduleBounds.get(b.id)!.latest, sortDir);
        case "type":
          return compareValues(a.type || "", b.type || "", sortDir);
        case "rooms":
          return compareValues(
            a.rooms.map((r) => r.room.name).join(", "),
            b.rooms.map((r) => r.room.name).join(", "),
            sortDir
          );
      }
    });
  }, [filtered, sortField, sortDir, scheduleBounds]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const allFilteredIds = sorted.map((fn) => fn.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        allFilteredIds.forEach((id) => next.add(id));
      }
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
    if (!confirm(`Delete ${ids.length} function${ids.length !== 1 ? "s" : ""}?`)) return;
    await deleteFunctions(ids);
    setSelected(new Set());
    router.refresh();
  }

  const thBase = "px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900";
  const thSortable = `${thBase} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none`;
  const filterCell = "px-2 py-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700";
  const filterInput = "w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white";

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
          <span className="text-sm text-blue-700 dark:text-blue-300">
            {selected.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            className="text-sm text-red-600 dark:text-red-400 hover:underline"
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 dark:text-gray-400 hover:underline ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className={`${thBase} w-8`}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className={thSortable} onClick={() => handleSort("name")}>
                Name{sortIndicator(sortField === "name", sortDir)}
              </th>
              <th className={thSortable} onClick={() => handleSort("earliestStart")}>
                Earliest Start{sortIndicator(sortField === "earliestStart", sortDir)}
              </th>
              <th className={thSortable} onClick={() => handleSort("latestEnd")}>
                Latest End{sortIndicator(sortField === "latestEnd", sortDir)}
              </th>
              <th className={thBase}>Setup Notes</th>
              <th className={thSortable} onClick={() => handleSort("type")}>
                Type{sortIndicator(sortField === "type", sortDir)}
              </th>
              <th className={thSortable} onClick={() => handleSort("rooms")}>
                Room(s){sortIndicator(sortField === "rooms", sortDir)}
              </th>
              <th className={thBase}>Contact(s)</th>
              <th className={thBase}>AV Order</th>
              <th className={thBase}>Setup Order</th>
              <th className={thBase}>Catering Order</th>
              <th className={thBase}>Workflow</th>
            </tr>
            <tr>
              <td className={filterCell} />
              <td className={filterCell}>
                <input
                  type="text"
                  placeholder="Filter…"
                  value={filters.name}
                  onChange={(e) => setFilter("name", e.target.value)}
                  className={filterInput}
                />
              </td>
              <td className={filterCell}>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilter("dateFrom", e.target.value)}
                  className={filterInput}
                  title="From date"
                />
              </td>
              <td className={filterCell}>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilter("dateTo", e.target.value)}
                  className={filterInput}
                  title="To date"
                />
              </td>
              <td className={filterCell} />
              <td className={filterCell}>
                <select
                  value={filters.type}
                  onChange={(e) => setFilter("type", e.target.value)}
                  className={filterInput}
                >
                  <option value="">All</option>
                  {functionTypes.map((t) => (
                    <option key={t.label} value={t.label}>{t.label}</option>
                  ))}
                </select>
              </td>
              <td className={filterCell}>
                <select
                  value={filters.room}
                  onChange={(e) => setFilter("room", e.target.value)}
                  className={filterInput}
                >
                  <option value="">All</option>
                  {allRooms.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </td>
              <td className={filterCell}>
                <input
                  type="text"
                  placeholder="Filter…"
                  value={filters.contacts}
                  onChange={(e) => setFilter("contacts", e.target.value)}
                  className={filterInput}
                />
              </td>
              <td className={filterCell}>
                <OrderFilter value={filters.av} onChange={(v) => setFilter("av", v)} className={filterInput} />
              </td>
              <td className={filterCell}>
                <OrderFilter value={filters.setup} onChange={(v) => setFilter("setup", v)} className={filterInput} />
              </td>
              <td className={filterCell}>
                <OrderFilter value={filters.catering} onChange={(v) => setFilter("catering", v)} className={filterInput} />
              </td>
              <td className={filterCell}>
                <select
                  value={filters.workflow}
                  onChange={(e) => setFilter("workflow", e.target.value as FilterState["workflow"])}
                  className={filterInput}
                >
                  <option value="">All</option>
                  <option value="none">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </td>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sorted.map((fn) => {
              const isSelected = selected.has(fn.id);
              const { earliest, latest } = scheduleBounds.get(fn.id)!;
              return (
                <tr
                  key={fn.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                >
                  <td className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(fn.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-3 font-medium">
                    <Link
                      href={`/events/${eventId}/functions/${fn.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {fn.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                    {formatScheduleDateTime(earliest, timezone)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                    {formatScheduleDateTime(latest, timezone)}
                  </td>
                  <td className="px-3 py-3 text-gray-600 dark:text-gray-400 max-w-xs">
                    <span className="line-clamp-2">{fn.notes || "—"}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {fn.type ? (
                      <span className={`px-2 py-0.5 text-xs rounded ${colorClasses[resolveOptionColor(fn.type, functionTypes)] || colorClasses.gray}`}>
                        {resolveOptionLabel(fn.type, functionTypes)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                    {fn.rooms.length > 0 ? fn.rooms.map((r) => r.room.name).join(", ") : "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                    {fn.contacts.length > 0
                      ? fn.contacts.map((c) => `${c.contact.firstName} ${c.contact.lastName}`).join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {fn.avOrder ? (
                      <Link href={`/events/${eventId}/av-orders/${fn.avOrder.id}`} className="text-blue-600 hover:underline text-sm">
                        {fn.avOrder.name}
                      </Link>
                    ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {fn.setupOrder ? (
                      <Link href={`/events/${eventId}/setup-orders/${fn.setupOrder.id}`} className="text-blue-600 hover:underline text-sm">
                        {getSetupOrderDisplayName(fn.setupOrder)}
                      </Link>
                    ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {fn.cateringOrder ? (
                      <Link href={`/events/${eventId}/catering-orders/${fn.cateringOrder.id}`} className="text-blue-600 hover:underline text-sm">
                        {fn.cateringOrder.name}
                      </Link>
                    ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <WorkflowBadge summary={workflowSummaries[fn.id]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">
            No functions match the current filters.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {sorted.length === functions.length
          ? `${functions.length} function${functions.length !== 1 ? "s" : ""}`
          : `${sorted.length} of ${functions.length} functions`}
      </p>
    </div>
  );
}
