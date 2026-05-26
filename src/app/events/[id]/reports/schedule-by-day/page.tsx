import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import { getEventScheduleData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ReportFilters } from "./ReportFilters";
import { ScheduleByDayReport } from "./ScheduleByDayReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Schedule by day" };

export default async function ScheduleByDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ includeNonPublic?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { includeNonPublic: nonPublicParam, addToDashboard } = await searchParams;

  const includeNonPublic = nonPublicParam === "true";

  const [event, dashboardChoices, data] = await Promise.all([
    getEvent(eventId),
    listShareLinkGroupChoicesForEvent(eventId),
    getEventScheduleData(eventId, { includeNonPublic }),
  ]);

  if (!event || !data) notFound();

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Schedule by Day" },
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
          includeNonPublic={includeNonPublic}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="SCHEDULE_BY_DAY"
              currentFilters={{ includeNonPublic }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <ReportPaper title="Schedule by Day">
          <ScheduleByDayReport data={data} includeNonPublic={includeNonPublic} />
        </ReportPaper>
      </div>
    </>
  );
}
