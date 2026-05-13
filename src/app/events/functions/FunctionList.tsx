"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { CustomOption } from "@prisma/client";
import type { FunctionForTable } from "./actions";
import { getDateKeyInTimezone, formatDateHeading } from "@/lib/agendaUtils";
import { colorClasses } from "@/lib/colors";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { FunctionTableView } from "./FunctionTableView";
import { getEarliestStart, formatScheduleDateTime } from "./scheduleUtils";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";

type FunctionListProps = {
  functions: FunctionForTable[];
  eventId: string;
  timezone: string;
  functionTypes: CustomOption[];
  substatuses: CustomOption[];
  workflowSummaries?: Record<string, WorkflowBadgeSummary>;
  initialStatus?: string;
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
    const earliest = getEarliestStart(fn);
    if (!earliest) {
      unscheduled.push(fn);
    } else {
      const dateKey = getDateKeyInTimezone(earliest, timezone);
      if (!dated.has(dateKey)) dated.set(dateKey, []);
      dated.get(dateKey)!.push(fn);
    }
  });

  dated.forEach((fns) => {
    fns.sort((a, b) => {
      const aTime = getEarliestStart(a)?.getTime() || 0;
      const bTime = getEarliestStart(b)?.getTime() || 0;
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
  duplicateFunction,
  deleteFunction,
  deleteFunctions,
  bulkUpdateFunctions,
}: FunctionListProps) {
  const [view, setView] = useState<"list" | "table">("list");
  const [filterStatus, setFilterStatus] = useState(initialStatus ?? "");

  const filteredFunctions = useMemo(() => {
    if (!filterStatus) return functions;
    if (filterStatus === "__blank__") return functions.filter((fn) => fn.status == null);
    return functions.filter((fn) => fn.status === filterStatus);
  }, [functions, filterStatus]);

  const { dated, unscheduled } = useMemo(
    () => groupByDate(filteredFunctions, timezone),
    [filteredFunctions, timezone]
  );
  const sortedDates = useMemo(() => Array.from(dated.keys()).sort(), [dated]);

  const renderFunction = (fn: FunctionForTable) => (
    <div key={fn.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/events/${eventId}/functions/${fn.id}`}
              className="text-blue-600 hover:underline font-medium truncate"
            >
              {fn.name}
            </Link>
            {fn.type && (
              <span className={`px-2 py-0.5 text-xs rounded ${colorClasses[resolveOptionColor(fn.type, functionTypes)] || colorClasses.gray}`}>
                {resolveOptionLabel(fn.type, functionTypes)}
              </span>
            )}
            {fn.breakoutGroup && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {fn.breakoutGroup.name}
              </span>
            )}
            <WorkflowBadge summary={workflowSummaries[fn.id]} />
            <EntityStatusBadge status={fn.status} substatus={fn.substatus} />
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
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
              <span className="ml-2">| {fn.rooms.map((r) => r.room.name).join(", ")}</span>
            ) : fn.offSiteLocation ? (
              <span className="ml-2">| Off-site: {fn.offSiteLocation}</span>
            ) : null}
          </div>
          {fn.description && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 truncate">{fn.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={async () => { await duplicateFunction(fn.id); }}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            title="Duplicate"
          >
            Copy
          </button>
          <Link href={`/events/${eventId}/functions/${fn.id}`} className="text-blue-600 hover:underline text-sm">
            Edit
          </Link>
          <button
            onClick={async () => {
              if (confirm("Delete this function?")) await deleteFunction(fn.id);
            }}
            className="text-red-600 hover:underline text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Functions ({filteredFunctions.length}{filteredFunctions.length !== functions.length ? ` of ${functions.length}` : ""})
          </h2>
          <ViewToggle view={view} onChange={setView} />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All statuses</option>
            <option value="__blank__">(blank)</option>
            {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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
          <Link
            href={`/events/${eventId}/functions/new`}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Function
          </Link>
        </div>
      </div>

      {functions.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No functions yet.{" "}
          <Link href={`/events/${eventId}/functions/new`} className="text-blue-600 hover:underline">
            Add your first function
          </Link>
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
