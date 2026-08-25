"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption, EntityStatus } from "@prisma/client";
import type { FunctionForTable } from "./actions";
import { getDateKeyInTimezone, formatDateHeading } from "@/lib/agendaUtils";
import { colorClasses } from "@/lib/colors";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { FunctionTableView } from "./FunctionTableView";
import { getMainStart, formatScheduleDateTime } from "./scheduleUtils";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type FunctionListProps = {
  functions: FunctionForTable[];
  eventId: string;
  timezone: string;
  functionTypes: CustomOption[];
  substatuses: CustomOption[];
  workflowSummaries?: Record<string, WorkflowBadgeSummary>;
  initialStatus?: string;
  initialSchedule?: string;
  initialRoom?: string;
  duplicateFunction: (id: string) => Promise<void>;
  deleteFunction: (id: string) => Promise<void>;
  deleteFunctions: (ids: string[]) => Promise<void>;
  bulkUpdateFunctions: (ids: string[], updates: { status?: import("@prisma/client").EntityStatus; substatus?: string | null; type?: string }) => Promise<void>;
};

function groupByDate(functions: FunctionForTable[], timezone: string): {
  dated: Map<string, FunctionForTable[]>;
  unscheduled: FunctionForTable[];
} {
  const dated = new Map<string, FunctionForTable[]>();
  const unscheduled: FunctionForTable[] = [];

  functions.forEach((fn) => {
    const anchor = getMainStart(fn);
    if (!anchor) {
      unscheduled.push(fn);
    } else {
      const dateKey = getDateKeyInTimezone(anchor, timezone);
      if (!dated.has(dateKey)) dated.set(dateKey, []);
      dated.get(dateKey)!.push(fn);
    }
  });

  dated.forEach((fns) => {
    fns.sort((a, b) => {
      const aTime = getMainStart(a)?.getTime() || 0;
      const bTime = getMainStart(b)?.getTime() || 0;
      return aTime - bTime;
    });
  });

  return { dated, unscheduled };
}

export function FunctionList({
  functions,
  eventId,
  timezone,
  functionTypes,
  substatuses,
  workflowSummaries = {},
  initialStatus,
  initialSchedule,
  initialRoom,
  duplicateFunction,
  deleteFunction,
  deleteFunctions,
  bulkUpdateFunctions,
}: FunctionListProps) {
  const canWrite = useCanWrite("FUNCTIONS");
  const canDelete = useCanDelete("FUNCTIONS");
  // Selection only exists to feed bulk edit and bulk delete, so it goes
  // away entirely when the user has neither.
  const canSelect = canWrite || canDelete;
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [filterStatus, setFilterStatus] = useState(initialStatus ?? "");
  const [filterSchedule, setFilterSchedule] = useState<"" | "yes" | "none">(
    initialSchedule === "yes" || initialSchedule === "none" ? initialSchedule : ""
  );
  const [filterRoom, setFilterRoom] = useState<"" | "yes" | "none">(
    initialRoom === "yes" || initialRoom === "none" ? initialRoom : ""
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkType, setBulkType] = useState("");

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

  async function handleBulkApply() {
    const ids = Array.from(selected);
    const updates: { status?: EntityStatus; substatus?: string | null; type?: string } = {};
    if (bulkStatus) updates.status = bulkStatus as EntityStatus;
    if (bulkStatus && bulkSubstatus) updates.substatus = bulkSubstatus;
    else if (bulkStatus) updates.substatus = null;
    if (bulkType) updates.type = bulkType;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdateFunctions(ids, updates);
    setSelected(new Set());
    setShowBulkEdit(false);
    setBulkStatus("");
    setBulkSubstatus("");
    setBulkType("");
    router.refresh();
  }

  const availableSubstatuses = useMemo(
    () => substatuses.filter((s) => !s.group || s.group === bulkStatus),
    [substatuses, bulkStatus]
  );

  const filteredFunctions = useMemo(() => {
    return functions.filter((fn) => {
      if (filterStatus === "__blank__") {
        if (fn.status != null) return false;
      } else if (filterStatus && fn.status !== filterStatus) return false;

      if (filterSchedule === "yes" && fn.schedules.length === 0) return false;
      if (filterSchedule === "none" && fn.schedules.length > 0) return false;

      if (filterRoom === "yes" && (fn.type === "BREAKOUT_BLOCK" || fn.rooms.length === 0)) return false;
      if (filterRoom === "none" && (fn.type === "BREAKOUT_BLOCK" || fn.rooms.length > 0)) return false;

      return true;
    });
  }, [functions, filterStatus, filterSchedule, filterRoom]);

  const { dated, unscheduled } = useMemo(
    () => groupByDate(filteredFunctions, timezone),
    [filteredFunctions, timezone]
  );
  const sortedDates = useMemo(() => Array.from(dated.keys()).sort(), [dated]);

  const renderFunction = (fn: FunctionForTable) => {
    const fnHref = fn.type === "BREAKOUT_BLOCK"
      ? `/events/${eventId}/breakout-schedule`
      : `/events/${eventId}/functions/${fn.id}`;
    return (
    <div key={fn.id} className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-start gap-3 ${selected.has(fn.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
      {canSelect && (
        <input type="checkbox" checked={selected.has(fn.id)} onChange={() => toggleRow(fn.id)} className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 shrink-0" />
      )}
      <div className="flex-1 min-w-0 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={fnHref}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium truncate"
            >
              {formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name)}
            </Link>
            <WorkflowBadge summary={workflowSummaries[fn.id]} />
            <EntityStatusBadge status={fn.status} substatus={fn.substatus} />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 flex-wrap">
            {fn.type && (
              <span className={`px-1.5 py-0.5 text-xs rounded ${colorClasses[resolveOptionColor(fn.type, functionTypes)] || colorClasses.gray}`}>
                {resolveOptionLabel(fn.type, functionTypes)}
              </span>
            )}
            {fn.schedules.length > 0 ? (
              <span>
                {fn.schedules.length === 1
                  ? formatScheduleDateTime(new Date(fn.schedules[0].startTime), timezone) + " – " + formatScheduleDateTime(new Date(fn.schedules[0].endTime), timezone)
                  : `${fn.schedules.length} scheduled times`}
              </span>
            ) : (
              <span className="text-yellow-600 dark:text-yellow-400">No schedule</span>
            )}
            {fn.rooms.length > 0 ? (
              <span>· {fn.rooms.map((r) => r.room.name).join(", ")}</span>
            ) : fn.offSiteLocation ? (
              <span>· Off-site: {fn.offSiteLocation}</span>
            ) : null}
          </div>
          {fn.description && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 truncate">{fn.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {canWrite && (
            <button
              onClick={async () => { await duplicateFunction(fn.id); }}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
              title="Duplicate"
            >
              Copy
            </button>
          )}
          <Link href={fnHref} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            {canWrite ? "Edit" : "View"}
          </Link>
          {canDelete && (
            <button
              onClick={async () => {
                if (confirm("Delete this function?")) await deleteFunction(fn.id);
              }}
              className="text-red-600 hover:underline text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Functions ({filteredFunctions.length}{filteredFunctions.length !== functions.length ? ` of ${functions.length}` : ""})
          </h2>
          <ViewToggle view={view} onChange={setView} />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="__blank__">(blank)</option>
              {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Schedule:</span>
            <select
              value={filterSchedule}
              onChange={(e) => setFilterSchedule(e.target.value as "" | "yes" | "none")}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="yes">Has</option>
              <option value="none">Missing</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Rooms:</span>
            <select
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value as "" | "yes" | "none")}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="yes">Has</option>
              <option value="none">Missing</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/events/${eventId}/functions/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
          <a
            href={`/events/${eventId}/functions/table-print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print Table
          </a>
          {canWrite && (
            <Link
              href={`/events/${eventId}/functions/new`}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Add Function
            </Link>
          )}
        </div>
      </div>

      {canSelect && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm">
          <span className="font-medium text-blue-700 dark:text-blue-300">{selected.size} selected</span>
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
            onClick={() => { setSelected(new Set()); setShowBulkEdit(false); }}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}
      {canWrite && showBulkEdit && selected.size > 0 && (
        <div className="mb-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={bulkStatus} onChange={(e) => { setBulkStatus(e.target.value as EntityStatus | ""); setBulkSubstatus(""); }} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
              <option value="">— no change —</option>
              {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {availableSubstatuses.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Substatus</label>
              <select value={bulkSubstatus} onChange={(e) => setBulkSubstatus(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
                <option value="">— no change —</option>
                {availableSubstatuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              </select>
            </div>
          )}
          {functionTypes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
              <select value={bulkType} onChange={(e) => setBulkType(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
                <option value="">— no change —</option>
                {functionTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleBulkApply} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Apply
          </button>
        </div>
      )}

      {functions.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No functions yet.
          {canWrite && (
            <>
              {" "}
              <Link href={`/events/${eventId}/functions/new`} className="text-blue-600 dark:text-blue-400 hover:underline">
                Add your first function
              </Link>
            </>
          )}
        </p>
      ) : view === "table" ? (
        <FunctionTableView
          functions={functions}
          eventId={eventId}
          timezone={timezone}
          functionTypes={functionTypes}
          substatuses={substatuses}
          workflowSummaries={workflowSummaries}
          initialStatus={initialStatus}
          initialSchedule={initialSchedule}
          initialRoom={initialRoom}
          deleteFunctions={deleteFunctions}
          bulkUpdateFunctions={bulkUpdateFunctions}
        />
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                {formatDateHeading(dateKey, timezone)}
              </h3>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {dated.get(dateKey)!.map(renderFunction)}
                </div>
              </div>
            </div>
          ))}

          {unscheduled.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Unscheduled
              </h3>
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {unscheduled.map(renderFunction)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
