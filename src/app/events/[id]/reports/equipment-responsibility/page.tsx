import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getEquipmentResponsibilityData, getEventLastUpdate } from "@/app/events/reports/actions";
import { LastUpdated } from "@/components/LastUpdated";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ReportFilters } from "./ReportFilters";
import { EquipmentResponsibilityReport } from "./EquipmentResponsibilityReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";

export const dynamic = "force-dynamic";

export default async function EquipmentResponsibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendors?: string; models?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { vendors: vendorParam, models: modelsParam, addToDashboard } = await searchParams;

  const selectedVendorIds = vendorParam ? vendorParam.split(",").filter(Boolean) : [];
  const selectedModelTypes = modelsParam ? modelsParam.split(",").filter(Boolean) : [];

  const filters = {
    vendorIds: selectedVendorIds.length > 0 ? selectedVendorIds : undefined,
    modelTypes: selectedModelTypes.length > 0 ? selectedModelTypes : undefined,
  };

  const [event, responsiblePartyVendors, groups, dashboardChoices, lastUpdate] = await Promise.all([
    getEvent(eventId),
    getResponsiblePartyVendors(eventId),
    getEquipmentResponsibilityData(eventId, filters),
    listShareLinkGroupChoicesForEvent(eventId),
    getEventLastUpdate(eventId),
  ]);

  if (!event) notFound();

  const vendorOptions = flattenResponsiblePartyOptions(responsiblePartyVendors);

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Equipment Responsibility" },
        ]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
        {lastUpdate && (
          <LastUpdated
            updatedAt={lastUpdate.updatedAt}
            updatedBy={lastUpdate.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        )}
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Equipment Responsibility</h2>

        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          vendors={vendorOptions}
          selectedVendorIds={selectedVendorIds}
          selectedModelTypes={selectedModelTypes}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="EQUIPMENT_RESPONSIBILITY"
              currentFilters={{ vendorIds: selectedVendorIds, modelTypes: selectedModelTypes }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <EquipmentResponsibilityReport groups={groups} />
      </div>
    </>
  );

}
