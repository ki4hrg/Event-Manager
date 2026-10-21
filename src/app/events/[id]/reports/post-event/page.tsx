import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "../../../actions";
import { getPostEventReportData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";
import { ReportFilters } from "./ReportFilters";
import { PostEventReport } from "./PostEventReport";
import { SpecDocHeader } from "../../../specifications/SpecDocHeader";

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
      <SpecDocHeader eventId={eventId} eventName={event.name} doc="per" active="preview" query={showBlank ? "blank=1" : ""} />
      <div className="max-w-5xl mx-auto">
        <AddToDashboardBanner eventId={eventId} addToDashboardId={addToDashboard} dashboardChoices={dashboardChoices} />
        <ReportFilters
          eventId={eventId}
          showBlank={showBlank}
          hidePrint
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
