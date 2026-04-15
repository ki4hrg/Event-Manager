import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { FunctionDetails } from "@/app/events/functions/FunctionDetails";
import { getFunction, getFunctions } from "@/app/events/functions/actions";
import { getEvent } from "../../../actions";
import { getOptions } from "@/app/settings/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";

export const dynamic = "force-dynamic";

export default async function FunctionsPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, functionList, functionTypes, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getFunctions(eventId),
    getOptions("function_type"),
    getOptions("schedule_type"),
  ]);

  if (!event) {
    notFound();
  }

  const records = await Promise.all(
    functionList.map(async (f) => {
      const [fn, workflows] = await Promise.all([
        getFunction(f.id),
        getWorkflowInstances("function", f.id),
      ]);
      return { fn, workflows };
    })
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title="All Functions"
        backHref={`/events/${eventId}/functions`}
      />

      {records.map(({ fn, workflows }, i) => {
        if (!fn) return null;
        return (
          <div
            key={fn.id}
            className={i < records.length - 1 ? "mb-12 pb-12 border-b-2 border-gray-300 print:break-after-page" : ""}
          >
            <h2 className="text-lg font-semibold text-gray-900 print:text-black mb-4">{fn.name}</h2>
            <FunctionDetails
              fn={fn}
              functionTypes={functionTypes}
              scheduleTypes={scheduleTypes}
              timezone={event.timezone}
              workflowInstances={workflows}
            />
          </div>
        );
      })}

      {records.length === 0 && (
        <p className="text-gray-500">No functions found for this event.</p>
      )}
    </div>
  );
}
