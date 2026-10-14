import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { getHotelInfoReportData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { requirePermission } from "@/lib/permissions";
import { parseBlockTypes } from "@/lib/hotels";
import { ReportFilters } from "./ReportFilters";
import { HotelInfoReport } from "./HotelInfoReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotel Information" };

export default async function HotelInfoReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blockTypes?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  await requirePermission("HOTELS", "VIEW", eventId);
  const blockTypes = parseBlockTypes(sp.blockTypes);
  const [event, data, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getHotelInfoReportData(eventId, { blockTypes }),
    listShareLinkGroupChoicesForEvent(eventId),
  ]);
  if (!event || !data) notFound();

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Hotel Information" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Hotel Information</h1>
      </div>
      <div className="max-w-4xl">
        <AddToDashboardBanner eventId={eventId} addToDashboardId={sp.addToDashboard} dashboardChoices={dashboardChoices} />
        <ReportFilters
          eventId={eventId}
          blockTypes={blockTypes}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="HOTEL_INFO"
              currentFilters={{ blockTypes }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={sp.addToDashboard}
            />
          }
        />
        <HotelInfoReport data={data} />
      </div>
    </>
  );
}
