import { notFound } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getEquipmentResponsibilityData } from "@/app/events/reports/actions";
import { EventTabs } from "../../EventTabs";
import { ReportFilters } from "./ReportFilters";
import { EquipmentResponsibilityReport } from "./EquipmentResponsibilityReport";

export const dynamic = "force-dynamic";

export default async function EquipmentResponsibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendors?: string; models?: string }>;
}) {
  const { id: eventId } = await params;
  const { vendors: vendorParam, models: modelsParam } = await searchParams;

  const selectedVendorIds = vendorParam ? vendorParam.split(",").filter(Boolean) : [];
  const selectedModelTypes = modelsParam ? modelsParam.split(",").filter(Boolean) : [];

  const filters = {
    vendorIds: selectedVendorIds.length > 0 ? selectedVendorIds : undefined,
    modelTypes: selectedModelTypes.length > 0 ? selectedModelTypes : undefined,
  };

  const [event, responsiblePartyVendors, groups] = await Promise.all([
    getEvent(eventId),
    getResponsiblePartyVendors(eventId),
    getEquipmentResponsibilityData(eventId, filters),
  ]);

  if (!event) notFound();

  const vendorOptions = flattenResponsiblePartyOptions(responsiblePartyVendors);

  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">{event.name}</h1>
      <EventTabs eventId={eventId} />

      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Equipment Responsibility</h2>
        </div>

        <ReportFilters
          eventId={eventId}
          vendors={vendorOptions}
          selectedVendorIds={selectedVendorIds}
          selectedModelTypes={selectedModelTypes}
        />

        <EquipmentResponsibilityReport groups={groups} />
      </div>
    </PageWrapper>
  );
}
