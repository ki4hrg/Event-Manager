import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getFunctionDetailData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { FunctionDetailReport } from "../FunctionDetailReport";

export const dynamic = "force-dynamic";

export default async function FunctionDetailPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functions?: string }>;
}) {
  const { id: eventId } = await params;
  const { functions: functionsParam } = await searchParams;

  const selectedFunctionIds = functionsParam
    ? functionsParam.split(",").filter(Boolean)
    : [];

  const filters = {
    functionIds:
      selectedFunctionIds.length > 0 ? selectedFunctionIds : undefined,
  };

  const backHref = `/events/${eventId}/reports/function-detail${
    functionsParam ? `?functions=${functionsParam}` : ""
  }`;

  const [event, data, functionTypes, scheduleTypes, serviceStyles, setupTypes] =
    await Promise.all([
      getEvent(eventId),
      getFunctionDetailData(eventId, filters),
      getOptions("function_type"),
      getOptions("schedule_type"),
      getOptions("service_style"),
      getOptions("setup_type"),
    ]);

  if (!event || !data) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PrintHeader
        eventName={event.name}
        title="Function Detail"
        backHref={backHref}
      />
      <FunctionDetailReport
        data={data}
        functionTypes={functionTypes}
        scheduleTypes={scheduleTypes}
        serviceStyles={serviceStyles}
        setupTypes={setupTypes}
      />
    </div>
  );
}
