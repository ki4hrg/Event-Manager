import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { getPostEventReportData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";
import { ReportFilters } from "./ReportFilters";
import { PostEventReport } from "./PostEventReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Post-Event Report" };

export default async function PostEventReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blank?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { blank, addToDashboard } = await searchParams;
  const showBlank = blank === "1";
  const [event, doc, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getPostEventReportData(eventId, { showBlank }),
    listShareLinkGroupChoicesForEvent(eventId),
  ]);
  if (!event || !doc) notFound();

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Post-Event Report" },
          ]}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{event.name}</h1>
          <Link href={`/events/${eventId}/post-event`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Edit post-event details
          </Link>
        </div>
      </div>
      <div className="max-w-5xl mx-auto">
        <AddToDashboardBanner eventId={eventId} addToDashboardId={addToDashboard} dashboardChoices={dashboardChoices} />
        <ReportFilters
          eventId={eventId}
          showBlank={showBlank}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="POST_EVENT"
              currentFilters={{ showBlank }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />
        <ReportPaper title="Post-Event Report">
          <PostEventReport doc={doc} />
        </ReportPaper>
      </div>
    </>
  );
}
