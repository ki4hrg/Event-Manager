import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { getOrderAssignedVendors, getVendorHandoffData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { ReportFilters } from "./ReportFilters";
import { VendorHandoffReport } from "./VendorHandoffReport";
import { ShareReportButton } from "@/components/ShareReportButton";

export const dynamic = "force-dynamic";

export default async function VendorHandoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { id: eventId } = await params;
  const { vendorId } = await searchParams;

  const [event, vendors, data, functionTypes] = await Promise.all([
    getEvent(eventId),
    getOrderAssignedVendors(eventId),
    vendorId ? getVendorHandoffData(eventId, vendorId) : Promise.resolve(null),
    getOptions("function_type"),
  ]);

  if (!event) notFound();

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Vendor Handoff" },
        ]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Vendor Handoff</h2>
          <ShareReportButton
            eventId={eventId}
            reportType="VENDOR_HANDOFF"
            currentFilters={{ vendorId: vendorId ?? undefined }}
          />
        </div>

        <ReportFilters
          eventId={eventId}
          vendors={vendors}
          selectedVendorId={vendorId ?? null}
        />

        {vendorId && data ? (
          <VendorHandoffReport data={data} event={event} functionTypes={functionTypes} />
        ) : vendorId && !data ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Vendor not found.</p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a vendor to view their handoff report.
          </p>
        )}
      </div>
    </>
  );

}
