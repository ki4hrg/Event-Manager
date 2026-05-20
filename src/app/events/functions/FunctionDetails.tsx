import type { getFunction } from "./actions";
import type { getWorkflowInstances } from "../workflows/actions";
import { Section, Field } from "@/components/print/PrintDetails";
import { WorkflowSection } from "@/components/print/WorkflowSection";
import { getSetupOrderDisplayName } from "../setup-orders/utils";
import { formatPhone } from "@/lib/format-phone";

type FunctionData = NonNullable<Awaited<ReturnType<typeof getFunction>>>;
type WorkflowInstance = Awaited<ReturnType<typeof getWorkflowInstances>>[number];

function formatDateTime(date: Date, timezone: string): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface FunctionDetailsProps {
  fn: FunctionData;
  timezone: string;
  workflowInstances: WorkflowInstance[];
}

export function FunctionDetails({
  fn,
  timezone,
  workflowInstances,
}: FunctionDetailsProps) {
  const typeLabel = fn.type ?? null;

  return (
    <div className="space-y-2">
      {/* Overview */}
      <Section title="Overview">
        <Field label="Type" value={typeLabel} />
        <Field label="Description" value={fn.description} />
        <Field label="Notes" value={fn.notes} />
        {fn.rooms.length > 0 ? (
          <Field label="Rooms" value={fn.rooms.map((fr) => fr.room.name).join(", ")} />
        ) : fn.offSiteLocation ? (
          <Field label="Location" value={`Off-site: ${fn.offSiteLocation}`} />
        ) : null}
      </Section>

      {/* Schedules */}
      {fn.schedules.length > 0 && (
        <Section title="Schedule">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Type</th>
                <th className="pb-1 pr-4 font-medium">Start</th>
                <th className="pb-1 pr-4 font-medium">End</th>
                <th className="pb-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {fn.schedules.map((s) => {
                return (
                  <tr key={s.id} className="border-t border-gray-100 print:border-gray-300">
                    <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                      {s.type ?? "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                      {s.startTime ? formatDateTime(s.startTime, timezone) : "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                      {s.endTime ? formatDateTime(s.endTime, timezone) : "—"}
                    </td>
                    <td className="py-1.5 text-gray-600 print:text-gray-700">{s.notes ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* Contacts */}
      {fn.contacts.length > 0 && (
        <Section title="Contacts">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 print:text-gray-600">
                <th className="pb-1 pr-4 font-medium">Name</th>
                <th className="pb-1 pr-4 font-medium">Role</th>
                <th className="pb-1 pr-4 font-medium">Email</th>
                <th className="pb-1 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {fn.contacts.map((fc) => (
                <tr key={fc.id} className="border-t border-gray-100 print:border-gray-300">
                  <td className="py-1.5 pr-4 text-gray-900 print:text-black">
                    {fc.contact.firstName} {fc.contact.lastName}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{fc.role ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-gray-600 print:text-gray-700">{fc.contact.email ?? "—"}</td>
                  <td className="py-1.5 text-gray-600 print:text-gray-700">{fc.contact.phone ? formatPhone(fc.contact.phone) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Linked Orders */}
      {(fn.avOrders.length > 0 ||
        fn.cateringOrder ||
        fn.setupOrders.length > 0 ||
        fn.printOrderFunctions.length > 0 ||
        fn.mediaDeliverableFunctions.length > 0) && (
        <Section title="Linked Orders">
          {fn.avOrders.length > 0 && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">
                AV Order{fn.avOrders.length > 1 ? "s" : ""}:{" "}
              </span>
              <span className="text-gray-900 print:text-black">{fn.avOrders.map((o) => o.name).join(", ")}</span>
            </div>
          )}
          {fn.cateringOrder && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">Catering Order: </span>
              <span className="text-gray-900 print:text-black">{fn.cateringOrder.name}</span>
            </div>
          )}
          {fn.setupOrders.length > 0 && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">
                Setup Order{fn.setupOrders.length > 1 ? "s" : ""}:{" "}
              </span>
              <span className="text-gray-900 print:text-black">
                {fn.setupOrders.map((o) => getSetupOrderDisplayName(o)).join(", ")}
              </span>
            </div>
          )}
          {fn.printOrderFunctions.length > 0 && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">
                Print Order{fn.printOrderFunctions.length > 1 ? "s" : ""}:{" "}
              </span>
              <span className="text-gray-900 print:text-black">
                {fn.printOrderFunctions.map((l) => l.printOrder.name).join(", ")}
              </span>
            </div>
          )}
          {fn.mediaDeliverableFunctions.length > 0 && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">
                Media Deliverable{fn.mediaDeliverableFunctions.length > 1 ? "s" : ""}:{" "}
              </span>
              <span className="text-gray-900 print:text-black">
                {fn.mediaDeliverableFunctions.map((l) => l.mediaDeliverable.name).join(", ")}
              </span>
            </div>
          )}
        </Section>
      )}

      <WorkflowSection workflowInstances={workflowInstances} />
    </div>
  );
}
