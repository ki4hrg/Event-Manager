import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/event";
import { getPackingListData } from "@/app/events/reports/data";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";
import { ReportFilters } from "./ReportFilters";
import { PackingListReport } from "./PackingListReport";
import { parsePackingListParams } from "./params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Packing list" };

export default async function PackingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    rooms?: string;
    packing?: string;
    acquisition?: string;
    providers?: string;
    hidePacked?: string;
    addToDashboard?: string;
  }>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  const { addToDashboard } = sp;

  const selected = parsePackingListParams(sp);

  const [event, data, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getPackingListData(eventId, {
      rooms: selected.rooms.length > 0 ? selected.rooms : undefined,
      packingStatuses:
        selected.packingStatuses.length > 0 ? selected.packingStatuses : undefined,
      acquisitionStates:
        selected.acquisitionStates.length > 0 ? selected.acquisitionStates : undefined,
      providers: selected.providers.length > 0 ? selected.providers : undefined,
      hidePacked: selected.hidePacked,
    }),
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
            { label: "Packing List" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <div className="max-w-5xl mx-auto">
        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          rooms={data.roomOptions}
          providers={data.providerOptions}
          selectedRoomIds={selected.rooms}
          selectedPackingStatuses={selected.packingStatuses}
          selectedAcquisitionStates={selected.acquisitionStates}
          selectedProviders={selected.providers}
          hidePacked={selected.hidePacked}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="PACKING_LIST"
              currentFilters={{
                rooms: selected.rooms,
                packingStatuses: selected.packingStatuses,
                acquisitionStates: selected.acquisitionStates,
                providers: selected.providers,
                hidePacked: selected.hidePacked,
              }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <ReportPaper title="Packing List">
          <PackingListReport data={data} />
        </ReportPaper>
      </div>
    </>
  );
}
