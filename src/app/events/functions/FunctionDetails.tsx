import type { getFunction } from "./actions";
import type { getWorkflowInstances } from "../workflows/actions";
import { Section, Field } from "@/components/print/PrintDetails";
import { WorkflowSection } from "@/components/print/WorkflowSection";

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
        <Field label="Setup Notes" value={fn.setupNotes} />
        {fn.rooms.length > 0 && (
          <Field label="Rooms" value={fn.rooms.map((fr) => fr.room.name).join(", ")} />
        )}
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
                  <td className="py-1.5 text-gray-600 print:text-gray-700">{fc.contact.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Linked Orders */}
      {(fn.avOrder || fn.cateringOrder || fn.setupOrder) && (
        <Section title="Linked Orders">
          {fn.avOrder && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">AV Order: </span>
              <span className="text-gray-900 print:text-black">{fn.avOrder.name}</span>
            </div>
          )}
          {fn.cateringOrder && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">Catering Order: </span>
              <span className="text-gray-900 print:text-black">{fn.cateringOrder.name}</span>
            </div>
          )}
          {fn.setupOrder && (
            <div className="text-sm mb-1">
              <span className="font-medium text-gray-500 print:text-gray-600">Setup Order: </span>
              <span className="text-gray-900 print:text-black">
                {[fn.setupOrder.room?.name, fn.setupOrder.description].filter(Boolean).join(" — ") || "Setup Order"}
              </span>
            </div>
          )}
        </Section>
      )}

      <WorkflowSection workflowInstances={workflowInstances} />
    </div>
  );
}
