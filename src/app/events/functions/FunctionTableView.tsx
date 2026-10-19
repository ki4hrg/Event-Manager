"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption } from "@prisma/client";
import type { EntityStatus } from "@prisma/client";
import type { FunctionForTable } from "./actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { colorClasses } from "@/lib/colors";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { getEarliestStart, getLatestEnd, formatScheduleDateTime } from "./scheduleUtils";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { compareFunctionNumbers, matchesFunctionQuery } from "@/lib/functionNumbers";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { getSetupOrderDisplayName } from "../setup-orders/utils";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import { ColumnPicker } from "@/components/ColumnPicker";
import { parseHiddenColumns } from "@/lib/tableColumns";
import { useHiddenColumns } from "@/lib/useHiddenColumns";
import { FUNCTION_TABLE_COLUMNS, type FunctionTableColumn } from "./tableColumns";

type SortField = "number" | "name" | "earliestStart" | "latestEnd" | "type" | "rooms";

type FilterState = {
  name: string;
  status: string;
  schedule: "" | "yes" | "no";
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
  name: "", status: "", schedule: "", dateFrom: "", dateTo: "", type: "", room: "", contacts: "",
  av: "", setup: "", catering: "", workflow: "",
};

// Hiding a column clears its filter, so no invisible filter keeps narrowing rows.
const COLUMN_FILTERS: Partial<Record<FunctionTableColumn, (keyof FilterState)[]>> = {
  status: ["status"],
  earliestStart: ["schedule", "dateFrom"],
  latestEnd: ["dateTo"],
  type: ["type"],
  rooms: ["room"],
  contacts: ["contacts"],
  av: ["av"],
  setup: ["setup"],
  catering: ["catering"],
  workflow: ["workflow"],
};

type Props = {
  functions: FunctionForTable[];
  eventId: string;
  timezone: string;
  functionTypes: CustomOption[];
  substatuses: CustomOption[];
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  initialStatus?: string;
  initialSchedule?: string;
  initialRoom?: string;
  initialHiddenColumns: string[];
  deleteFunctions: (ids: string[]) => Promise<void>;
  bulkUpdateFunctions: (ids: string[], updates: { status?: EntityStatus; substatus?: string | null; type?: string }) => Promise<void>;
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
  substatuses,
  workflowSummaries,
  initialStatus,
  initialSchedule,
  initialRoom,
  initialHiddenColumns,
  deleteFunctions,
  bulkUpdateFunctions,
}: Props) {
  const canWrite = useCanWrite("FUNCTIONS");
  const canDelete = useCanDelete("FUNCTIONS");
  const canSelect = canWrite || canDelete;
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>("earliestStart");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    status: initialStatus ?? "",
    schedule: initialSchedule === "yes" ? "yes" : initialSchedule === "none" ? "no" : "",
    room: initialRoom === "none" ? "__none__" : "",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkType, setBulkType] = useState("");
  const columns = useHiddenColumns<FunctionTableColumn>(
    "functions",
    parseHiddenColumns(initialHiddenColumns, FUNCTION_TABLE_COLUMNS)
  );
  const show = columns.isVisible;

  function toggleColumn(key: FunctionTableColumn, hide: boolean) {
    columns.setColumnHidden(key, hide);
    const cleared = hide ? COLUMN_FILTERS[key] : undefined;
    if (cleared) {
      setFilters((prev) => {
        const next = { ...prev };
        for (const k of cleared) (next as Record<keyof FilterState, string>)[k] = DEFAULT_FILTERS[k];
        return next;
      });
    }
  }

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
      if (filters.name && !matchesFunctionQuery(fn, filters.name)) return false;

      if (filters.status === "__blank__") {
        if (fn.status != null) return false;
      } else if (filters.status && fn.status !== filters.status) return false;

      if (filters.schedule === "yes" && fn.schedules.length === 0) return false;
      if (filters.schedule === "no" && fn.schedules.length > 0) return false;

      const { earliest } = scheduleBounds.get(fn.id)!;
      if (filters.dateFrom) {
        const from = parseDateTimeInTimezone(filters.dateFrom + "T00:00:00", timezone);
        if (!earliest || earliest < from) return false;
      }
      if (filters.dateTo) {
        const to = parseDateTimeInTimezone(filters.dateTo + "T23:59:59", timezone);
        if (!earliest || earliest > to) return false;
      }

      if (filters.type && fn.type !== filters.type) return false;

      if (filters.room === "__none__") {
        if (fn.type === "BREAKOUT_BLOCK" || fn.rooms.length > 0 || fn.offSiteLocation) return false;
      } else if (filters.room && !fn.rooms.some((r) => r.room.name === filters.room)) return false;

      if (filters.contacts) {
        const query = filters.contacts.toLowerCase();
        const hasContact = fn.contacts.some((c) =>
          `${c.contact.firstName} ${c.contact.lastName}`.toLowerCase().includes(query)
        );
        if (!hasContact) return false;
      }

      if (filters.av === "yes" && fn.avOrders.length === 0) return false;
      if (filters.av === "no" && fn.avOrders.length > 0) return false;

      if (filters.setup === "yes" && fn.setupOrders.length === 0) return false;
      if (filters.setup === "no" && fn.setupOrders.length > 0) return false;

      if (filters.catering === "yes" && !fn.cateringOrder) return false;
      if (filters.catering === "no" && fn.cateringOrder) return false;

      if (filters.workflow) {
        if (workflowStatus(workflowSummaries[fn.id]) !== filters.workflow) return false;
      }

      return true;
    });
  }, [functions, filters, scheduleBounds, workflowSummaries, timezone]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "number": {
          const cmp = compareFunctionNumbers(a.functionNumber, b.functionNumber);
          // Unnumbered rows stay last in both directions.
          if (!a.functionNumber || !b.functionNumber) return cmp;
          return sortDir === "asc" ? cmp : -cmp;
        }
        case "name":
          return compareValues(
            formatBreakoutSessionName(a.name, a.breakoutGroup?.name),
            formatBreakoutSessionName(b.name, b.breakoutGroup?.name),
            sortDir
          );
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
    await deleteFunctions(ids);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkUpdate() {
    const ids = Array.from(selected);
    const updates: { status?: EntityStatus; substatus?: string | null; type?: string } = {};
    if (bulkStatus) updates.status = bulkStatus;
    if (bulkSubstatus) updates.substatus = bulkSubstatus;
    if (bulkType) updates.type = bulkType;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdateFunctions(ids, updates);
    setShowBulkEdit(false);
    setBulkStatus("");
    setBulkSubstatus("");
    setBulkType("");
    router.refresh();
  }

  const filteredSubstatuses = bulkStatus
    ? substatuses.filter((s) => !s.group || s.group === bulkStatus)
    : substatuses;

  const thBase = "px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900";
  const thSortable = `${thBase} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none`;
  const filterCell = "px-2 py-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700";
  const filterInput = "w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white";

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ColumnPicker
          columns={FUNCTION_TABLE_COLUMNS}
          hidden={columns.hidden}
          onToggle={toggleColumn}
          onShowAll={columns.showAll}
        />
      </div>
      {canSelect && selected.size > 0 && (
        <div className="flex flex-col gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {selected.size} selected
            </span>
            {canWrite && (
              <button
                onClick={() => setShowBulkEdit((v) => !v)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Bulk edit
              </button>
            )}
            {canDelete && (
              <InlineConfirmButton
                onConfirm={handleBulkDelete}
                label="Delete selected"
                confirmLabel={`Delete ${selected.size} function${selected.size !== 1 ? "s" : ""}`}
                resource="FUNCTIONS"
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              />
            )}
            <button
              onClick={() => { setSelected(new Set()); setShowBulkEdit(false); }}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline ml-auto"
            >
              Clear selection
            </button>
          </div>
          {canWrite && showBulkEdit && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-blue-200 dark:border-blue-700">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600 dark:text-gray-400">Status</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => { setBulkStatus(e.target.value as EntityStatus | ""); setBulkSubstatus(""); }}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-white"
                >
                  <option value="">— no change —</option>
                  {EDIT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600 dark:text-gray-400">Substatus</label>
                <select
                  value={bulkSubstatus}
                  onChange={(e) => setBulkSubstatus(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-white"
                >
                  <option value="">— no change —</option>
                  {filteredSubstatuses.map((s) => (
                    <option key={s.id} value={s.label}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600 dark:text-gray-400">Type</label>
                <select
                  value={bulkType}
                  onChange={(e) => setBulkType(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-white"
                >
                  <option value="">— no change —</option>
                  {functionTypes.map((t) => (
                    <option key={t.id} value={t.label}>{t.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleBulkUpdate}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Apply to {selected.size} selected
              </button>
              <button
                onClick={() => setShowBulkEdit(false)}
                className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              {canSelect && (
                <th className={`${thBase} w-8`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
              )}
              {show("number") && (
                <th className={thSortable} onClick={() => handleSort("number")}>
                  #{sortIndicator(sortField === "number", sortDir)}
                </th>
              )}
              <th className={thSortable} onClick={() => handleSort("name")}>
                Name{sortIndicator(sortField === "name", sortDir)}
              </th>
              {show("status") && (
                <th className={thBase}>Status</th>
              )}
              {show("earliestStart") && (
                <th className={thSortable} onClick={() => handleSort("earliestStart")}>
                  Earliest Start{sortIndicator(sortField === "earliestStart", sortDir)}
                </th>
              )}
              {show("latestEnd") && (
                <th className={thSortable} onClick={() => handleSort("latestEnd")}>
                  Latest End{sortIndicator(sortField === "latestEnd", sortDir)}
                </th>
              )}
              {show("notes") && (
                <th className={thBase}>Setup Notes</th>
              )}
              {show("type") && (
                <th className={thSortable} onClick={() => handleSort("type")}>
                  Type{sortIndicator(sortField === "type", sortDir)}
                </th>
              )}
              {show("rooms") && (
                <th className={thSortable} onClick={() => handleSort("rooms")}>
                  Room(s){sortIndicator(sortField === "rooms", sortDir)}
                </th>
              )}
              {show("contacts") && (
                <th className={thBase}>Contact(s)</th>
              )}
              {show("av") && (
                <th className={thBase}>AV Order</th>
              )}
              {show("setup") && (
                <th className={thBase}>Setup Order</th>
              )}
              {show("catering") && (
                <th className={thBase}>Catering Order</th>
              )}
              {show("workflow") && (
                <th className={thBase}>Workflow</th>
              )}
            </tr>
            <tr>
              {/* Spacer under the select-all column; drops with it. */}
              {canSelect && <td className={filterCell} />}
              {show("number") && <td className={filterCell} />}
              <td className={filterCell}>
                <input
                  type="text"
                  placeholder="Name or #…"
                  value={filters.name}
                  onChange={(e) => setFilter("name", e.target.value)}
                  className={filterInput}
                />
              </td>
              {show("status") && (
                <td className={filterCell}>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilter("status", e.target.value)}
                    className={filterInput}
                  >
                    <option value="">All</option>
                    <option value="__blank__">(blank)</option>
                    {EDIT_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
              )}
              {show("earliestStart") && (
                <td className={filterCell}>
                  <div className="flex flex-col gap-1">
                    <OrderFilter value={filters.schedule} onChange={(v) => setFilter("schedule", v)} className={filterInput} />
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilter("dateFrom", e.target.value)}
                      className={filterInput}
                      title="From date"
                    />
                  </div>
                </td>
              )}
              {show("latestEnd") && (
                <td className={filterCell}>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilter("dateTo", e.target.value)}
                    className={filterInput}
                    title="To date"
                  />
                </td>
              )}
              {show("notes") && <td className={filterCell} />}
              {show("type") && (
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
              )}
              {show("rooms") && (
                <td className={filterCell}>
                  <select
                    value={filters.room}
                    onChange={(e) => setFilter("room", e.target.value)}
                    className={filterInput}
                  >
                    <option value="">All</option>
                    <option value="__none__">(none)</option>
                    {allRooms.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
              )}
              {show("contacts") && (
                <td className={filterCell}>
                  <input
                    type="text"
                    placeholder="Filter…"
                    value={filters.contacts}
                    onChange={(e) => setFilter("contacts", e.target.value)}
                    className={filterInput}
                  />
                </td>
              )}
              {show("av") && (
                <td className={filterCell}>
                  <OrderFilter value={filters.av} onChange={(v) => setFilter("av", v)} className={filterInput} />
                </td>
              )}
              {show("setup") && (
                <td className={filterCell}>
                  <OrderFilter value={filters.setup} onChange={(v) => setFilter("setup", v)} className={filterInput} />
                </td>
              )}
              {show("catering") && (
                <td className={filterCell}>
                  <OrderFilter value={filters.catering} onChange={(v) => setFilter("catering", v)} className={filterInput} />
                </td>
              )}
              {show("workflow") && (
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
              )}
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
                  {canSelect && (
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(fn.id)}
                        className="rounded"
                      />
                    </td>
                  )}
                  {show("number") && (
                    <td className="px-3 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {fn.functionNumber ? `#${fn.functionNumber}` : ""}
                    </td>
                  )}
                  <td className="px-3 py-3 font-medium">
                    <Link
                      href={`/events/${eventId}/functions/${fn.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name)}
                    </Link>
                  </td>
                  {show("status") && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <EntityStatusBadge status={fn.status} substatus={fn.substatus} />
                    </td>
                  )}
                  {show("earliestStart") && (
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {formatScheduleDateTime(earliest, timezone)}
                    </td>
                  )}
                  {show("latestEnd") && (
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {formatScheduleDateTime(latest, timezone)}
                    </td>
                  )}
                  {show("notes") && (
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400 max-w-xs">
                      <span className="line-clamp-2">{fn.notes || "—"}</span>
                    </td>
                  )}
                  {show("type") && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fn.type ? (
                        <span className={`px-2 py-0.5 text-xs rounded ${colorClasses[resolveOptionColor(fn.type, functionTypes)] || colorClasses.gray}`}>
                          {resolveOptionLabel(fn.type, functionTypes)}
                        </span>
                      ) : "—"}
                    </td>
                  )}
                  {show("rooms") && (
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                      {fn.rooms.length > 0 ? fn.rooms.map((r) => r.room.name).join(", ") : "—"}
                    </td>
                  )}
                  {show("contacts") && (
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                      {fn.contacts.length > 0
                        ? fn.contacts.map((c) => `${c.contact.firstName} ${c.contact.lastName}`).join(", ")
                        : "—"}
                    </td>
                  )}
                  {show("av") && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fn.avOrders.length > 0 ? (
                        <span className="text-sm">
                          {fn.avOrders.map((o, i) => (
                            <span key={o.id}>
                              {i > 0 && ", "}
                              <Link href={`/events/${eventId}/av-orders/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{o.name}</Link>
                            </span>
                          ))}
                        </span>
                      ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                    </td>
                  )}
                  {show("setup") && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fn.setupOrders.length > 0 ? (
                        <span className="text-sm">
                          {fn.setupOrders.map((o, i) => (
                            <span key={o.id}>
                              {i > 0 && ", "}
                              <Link href={`/events/${eventId}/setup-orders/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{getSetupOrderDisplayName(o)}</Link>
                            </span>
                          ))}
                        </span>
                      ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                    </td>
                  )}
                  {show("catering") && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {fn.cateringOrder ? (
                        <Link href={`/events/${eventId}/catering-orders/${fn.cateringOrder.id}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                          {fn.cateringOrder.name}
                        </Link>
                      ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                    </td>
                  )}
                  {show("workflow") && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <WorkflowBadge summary={workflowSummaries[fn.id]} />
                    </td>
                  )}
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
