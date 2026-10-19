import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintHeader } from "@/components/print/PrintHeader";
import { FunctionDetails } from "@/app/events/functions/FunctionDetails";
import { getFunction } from "@/app/events/functions/actions";
import { getEvent } from "../../../../actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";
import { getOptions } from "@/app/settings/actions";
import { formatFunctionLabel } from "@/lib/functionNumbers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}): Promise<Metadata> {
  const { functionId } = await params;
  const fn = await prisma.function.findUnique({
    where: { id: functionId },
    select: { name: true },
  });
  return { title: fn ? `${fn.name} (print)` : "Function (print)" };
}

export default async function FunctionPrintPage({
  params,
}: {
  params: Promise<{ id: string; functionId: string }>;
}) {
  const { id: eventId, functionId } = await params;

  const [event, fn, workflowInstances, functionTypes, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getFunction(functionId),
    getWorkflowInstances("function", functionId, eventId),
    getOptions("function_type"),
    getOptions("schedule_type"),
  ]);

  if (!event || !fn) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        recordType="Function"
        recordName={formatFunctionLabel(fn)}
        backHref={`/events/${eventId}/functions/${functionId}`}
      />
      <FunctionDetails
        fn={fn}
        timezone={event.timezone}
        workflowInstances={workflowInstances}
        functionTypes={functionTypes}
        scheduleTypes={scheduleTypes}
      />
    </div>
  );
}
