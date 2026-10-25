import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { reportTh as th, reportTd as td } from "@/lib/reportStyles";
import { getFunctionsForTable } from "@/app/events/functions/actions";
import { getEvent } from "@/app/events/event";
import { getWorkflowBadgeSummaries } from "@/app/events/workflows/actions";
import type { WorkflowRowSummary } from "@/lib/workflowProgress";
import type { FunctionForTable } from "@/app/events/functions/actions";
import { getSetupOrderDisplayName } from "@/app/events/setup-orders/utils";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { getOptions } from "@/app/(admin)/settings/actions";
import { getHiddenColumns } from "@/app/events/table-columns-actions";
import { parseHiddenColumns } from "@/lib/tableColumns";
import { FUNCTION_TABLE_COLUMNS, type FunctionTableColumn } from "@/app/events/functions/tableColumns";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Function table (print)" };

function getEarliestStart(fn: FunctionForTable): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((min, s) => {
    const t = new Date(s.startTime);
    return t < min ? t : min;
  }, new Date(fn.schedules[0].startTime));
}

function getLatestEnd(fn: FunctionForTable): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((max, s) => {
    const t = new Date(s.endTime);
    return t > max ? t : max;
  }, new Date(fn.schedules[0].endTime));
}

function formatDateTime(date: Date | null, timezone: string): string {
  if (!date) return "—";
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Each workflow's step in progress, or Done.
function workflowLabel(summary: WorkflowRowSummary | undefined): string {
  const drawn = summary?.workflows.filter((w) => w.steps.length > 0) ?? [];
  if (drawn.length === 0) return "—";
  return drawn
    .map((w) => w.steps.find((s) => s.status === "active" || s.status === "partial")?.label ?? "Done")
    .join("; ");
}

export default async function FunctionTablePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, functions, functionTypes, storedHidden] = await Promise.all([
    getEvent(eventId),
    getFunctionsForTable(eventId),
    getOptions("function_type"),
    getHiddenColumns("functions"),
  ]);

  if (!event) notFound();

  // Same picks as the on-screen table view.
  const hidden = parseHiddenColumns(storedHidden, FUNCTION_TABLE_COLUMNS);
  const show = (key: FunctionTableColumn) => !hidden.has(key);

  const workflowSummaries: Record<string, WorkflowRowSummary> =
    functions.length > 0
      ? await getWorkflowBadgeSummaries("function", functions.map((f) => f.id), eventId)
      : {};

  const tz = event.timezone || "America/Chicago";

  return (
    <>
      <style>{`@page { size: landscape; margin: 0.4in; }`}</style>
      <div className="max-w-7xl mx-auto px-8 py-8 bg-white dark:bg-gray-900 print:bg-white print:px-0 print:py-0">
        <PrintHeader
          eventName={event.name}
          title="Functions Table"
          backHref={`/events/${eventId}/functions`}
        />

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} print:whitespace-normal`}>Name</th>
                {show("earliestStart") && <th className={`${th} print:whitespace-normal`}>Earliest Start</th>}
                {show("latestEnd") && <th className={`${th} print:whitespace-normal`}>Latest End</th>}
                {show("notes") && <th className={`${th} print:whitespace-normal`}>Notes</th>}
                {show("type") && <th className={`${th} print:whitespace-normal`}>Type</th>}
                {show("rooms") && <th className={`${th} print:whitespace-normal`}>Room(s)</th>}
                {show("contacts") && <th className={`${th} print:whitespace-normal`}>Contact(s)</th>}
                {show("av") && <th className={`${th} print:whitespace-normal`}>AV Order</th>}
                {show("setup") && <th className={`${th} print:whitespace-normal`}>Setup Order</th>}
                {show("catering") && <th className={`${th} print:whitespace-normal`}>Catering Order</th>}
                {show("workflow") && <th className={`${th} print:whitespace-normal`}>Workflow</th>}
              </tr>
            </thead>
            <tbody>
              {functions.map((fn) => (
                <tr key={fn.id}>
                  <td className={`${td} font-medium`}>{formatFunctionLabel(fn)}</td>
                  {show("earliestStart") && <td className={`${td} whitespace-nowrap`}>{formatDateTime(getEarliestStart(fn), tz)}</td>}
                  {show("latestEnd") && <td className={`${td} whitespace-nowrap`}>{formatDateTime(getLatestEnd(fn), tz)}</td>}
                  {show("notes") && <td className={td}>{fn.notes || "—"}</td>}
                  {show("type") && (
                    <td className={`${td} whitespace-nowrap print:whitespace-normal`}>
                      {resolveOptionLabel(fn.type, functionTypes) || "—"}
                    </td>
                  )}
                  {show("rooms") && (
                    <td className={td}>
                      {fn.rooms.length > 0 ? fn.rooms.map((r) => r.room.name).join(", ") : fn.offSiteLocation ? `Off-site: ${fn.offSiteLocation}` : "—"}
                    </td>
                  )}
                  {show("contacts") && (
                    <td className={td}>
                      {fn.contacts.length > 0
                        ? fn.contacts.map((c) => `${c.contact.firstName} ${c.contact.lastName}`).join(", ")
                        : "—"}
                    </td>
                  )}
                  {show("av") && <td className={`${td} whitespace-nowrap print:whitespace-normal`}>{fn.avOrders.length > 0 ? fn.avOrders.map((o) => o.name).join(", ") : "—"}</td>}
                  {show("setup") && (
                    <td className={`${td} whitespace-nowrap print:whitespace-normal`}>
                      {fn.setupOrders.length > 0 ? fn.setupOrders.map((o) => getSetupOrderDisplayName(o)).join(", ") : "—"}
                    </td>
                  )}
                  {show("catering") && <td className={`${td} whitespace-nowrap print:whitespace-normal`}>{fn.cateringOrder?.name || "—"}</td>}
                  {show("workflow") && <td className={`${td} whitespace-nowrap print:whitespace-normal`}>{workflowLabel(workflowSummaries[fn.id])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {functions.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 py-8 text-sm">No functions found.</p>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-6">
          {functions.length} function{functions.length !== 1 ? "s" : ""} &middot; Generated{" "}
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </>
  );
}
