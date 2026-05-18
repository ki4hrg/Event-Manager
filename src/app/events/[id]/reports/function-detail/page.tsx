import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import {
  getFunctionDetailData,
  getFunctionPickerOptions,
} from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { getOptions } from "@/app/settings/actions";
import { ReportFilters } from "./ReportFilters";
import { FunctionDetailReport } from "./FunctionDetailReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Function detail" };

export default async function FunctionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functions?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { functions: functionsParam, addToDashboard } = await searchParams;

  const selectedFunctionIds = functionsParam
    ? functionsParam.split(",").filter(Boolean)
    : [];

  const filters = {
    functionIds:
      selectedFunctionIds.length > 0 ? selectedFunctionIds : undefined,
  };

  const [event, pickerOptions, data, functionTypes, scheduleTypes, serviceStyles, setupTypes, dashboardChoices] =
    await Promise.all([
      getEvent(eventId),
      getFunctionPickerOptions(eventId),
      getFunctionDetailData(eventId, filters),
      getOptions("function_type"),
      getOptions("schedule_type"),
      getOptions("service_style"),
      getOptions("setup_type"),
      listShareLinkGroupChoicesForEvent(eventId),
    ]);

  if (!event || !data) notFound();

  const validIds = new Set(pickerOptions.map((o) => o.value));
  const validSelected = selectedFunctionIds.filter((id) => validIds.has(id));

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Function Detail" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Function Detail
        </h2>

        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          functions={pickerOptions}
          selectedFunctionIds={validSelected}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="FUNCTION_DETAIL"
              currentFilters={{ functionIds: validSelected }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <FunctionDetailReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
          serviceStyles={serviceStyles}
          setupTypes={setupTypes}
        />
      </div>
    </>
  );
}
