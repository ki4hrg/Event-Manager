import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { getOrderAssignedVendors, getVendorHandoffData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { getOptions } from "@/app/settings/actions";
import { ReportFilters } from "./ReportFilters";
import { VendorHandoffReport } from "./VendorHandoffReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendor handoff" };

export default async function VendorHandoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendorId?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { vendorId, addToDashboard } = await searchParams;

  const [event, vendors, data, functionTypes, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getOrderAssignedVendors(eventId),
    vendorId ? getVendorHandoffData(eventId, vendorId) : Promise.resolve(null),
    getOptions("function_type"),
    listShareLinkGroupChoicesForEvent(eventId),
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Vendor Handoff</h2>

        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          vendors={vendors}
          selectedVendorId={vendorId ?? null}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="VENDOR_HANDOFF"
              currentFilters={{ vendorId: vendorId ?? undefined }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
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
