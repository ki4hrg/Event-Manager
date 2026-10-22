import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { getHotelInfoReportData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { requirePermission } from "@/lib/permissions";
import { hotelInfoGuestTypes } from "@/lib/hotels";
import { ReportFilters } from "./ReportFilters";
import { HotelInfoReport } from "./HotelInfoReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotel Information" };

export default async function HotelInfoReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guestTypes?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  await requirePermission("HOTELS", "VIEW", eventId);
  const guestTypes = hotelInfoGuestTypes(sp.guestTypes);
  const [event, data, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getHotelInfoReportData(eventId, { guestTypes }),
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
            { label: "Reports", href: `/events/${eventId}/reports` },
            { label: "Hotel Information" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Hotel Information</h1>
      </div>
      <div className="max-w-4xl">
        <AddToDashboardBanner eventId={eventId} addToDashboardId={sp.addToDashboard} dashboardChoices={dashboardChoices} />
        <ReportFilters
          eventId={eventId}
          guestTypes={data.guestTypes}
          guestTypeOptions={data.guestTypeOptions}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="HOTEL_INFO"
              currentFilters={{ guestTypes: data.guestTypes }}
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
