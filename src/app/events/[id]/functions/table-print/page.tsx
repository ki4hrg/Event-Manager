import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getFunctionsForTable } from "@/app/events/functions/actions";
import { getEvent } from "../../../actions";
import { getWorkflowBadgeSummaries } from "@/app/events/workflows/actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import type { FunctionForTable } from "@/app/events/functions/actions";

export const dynamic = "force-dynamic";

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

function workflowLabel(summary: WorkflowBadgeSummary | undefined): string {
  if (!summary || summary.count === 0) return "—";
  if (summary.total === 0) return "—";
  if (summary.done === summary.total) return "Done";
  return `In progress (${summary.done}/${summary.total})`;
}

export default async function FunctionTablePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, functions] = await Promise.all([
    getEvent(eventId),
    getFunctionsForTable(eventId),
  ]);

  if (!event) notFound();

  const workflowSummaries: Record<string, WorkflowBadgeSummary> =
    functions.length > 0
      ? await getWorkflowBadgeSummaries("function", functions.map((f) => f.id))
      : {};

  const tz = event.timezone || "America/Chicago";

  const th = "px-3 py-2 text-left text-xs font-semibold text-gray-900 print:text-black border-b border-gray-300 print:border-gray-400 bg-gray-100 print:bg-gray-200 whitespace-nowrap";
  const td = "px-3 py-2 text-xs text-gray-700 print:text-gray-900 border-b border-gray-200 print:border-gray-300 align-top";

  return (
    <div className="max-w-7xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title="Functions Table"
        backHref={`/events/${eventId}/functions`}
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Earliest Start</th>
              <th className={th}>Latest End</th>
              <th className={th}>Setup Notes</th>
              <th className={th}>Type</th>
              <th className={th}>Room(s)</th>
              <th className={th}>Contact(s)</th>
              <th className={th}>AV Order</th>
              <th className={th}>Setup Order</th>
              <th className={th}>Catering Order</th>
              <th className={th}>Workflow</th>
            </tr>
          </thead>
          <tbody>
            {functions.map((fn) => (
              <tr key={fn.id}>
                <td className={`${td} font-medium`}>{fn.name}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(getEarliestStart(fn), tz)}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(getLatestEnd(fn), tz)}</td>
                <td className={td}>{fn.setupNotes || "—"}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {fn.type ?? "—"}
                </td>
                <td className={td}>
                  {fn.rooms.length > 0 ? fn.rooms.map((r) => r.room.name).join(", ") : "—"}
                </td>
                <td className={td}>
                  {fn.contacts.length > 0
                    ? fn.contacts.map((c) => `${c.contact.firstName} ${c.contact.lastName}`).join(", ")
                    : "—"}
                </td>
                <td className={`${td} whitespace-nowrap`}>{fn.avOrder?.name || "—"}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {fn.setupOrder
                    ? fn.setupOrder.description || fn.setupOrder.setupType || "Setup Order"
                    : "—"}
                </td>
                <td className={`${td} whitespace-nowrap`}>{fn.cateringOrder?.name || "—"}</td>
                <td className={`${td} whitespace-nowrap`}>{workflowLabel(workflowSummaries[fn.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {functions.length === 0 && (
        <p className="text-gray-500 py-8 text-sm">No functions found.</p>
      )}

      <p className="text-xs text-gray-500 print:text-gray-600 mt-6">
        {functions.length} function{functions.length !== 1 ? "s" : ""} &middot; Generated{" "}
        {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>
    </div>
  );
}
