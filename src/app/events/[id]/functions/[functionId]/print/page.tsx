import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { FunctionDetails } from "@/app/events/functions/FunctionDetails";
import { getFunction } from "@/app/events/functions/actions";
import { getEvent } from "../../../../actions";
import { getOptions } from "@/app/settings/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";

export const dynamic = "force-dynamic";

export default async function FunctionPrintPage({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}) {
  const { id: eventId, functionId } = await params;

  const [event, fn, functionTypes, scheduleTypes, workflowInstances] = await Promise.all([
    getEvent(eventId),
    getFunction(functionId),
    getOptions("function_type"),
    getOptions("schedule_type"),
    getWorkflowInstances("function", functionId),
  ]);

  if (!event || !fn) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        recordType="Function"
        recordName={fn.name}
        backHref={`/events/${eventId}/functions/${functionId}`}
      />
      <FunctionDetails
        fn={fn}
        functionTypes={functionTypes}
        scheduleTypes={scheduleTypes}
        timezone={event.timezone}
        workflowInstances={workflowInstances}
      />
    </div>
  );
}
