import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import { getEventScheduleData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { getOptions } from "@/app/settings/actions";
import { ReportFilters } from "./ReportFilters";
import { EventScheduleReport } from "./EventScheduleReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event schedule" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ types?: string; includeNonPublic?: string; compact?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { types: typesParam, includeNonPublic: nonPublicParam, compact: compactParam, addToDashboard } = await searchParams;

  const selectedTypes = parseListParam(typesParam);
  const includeNonPublic = nonPublicParam === "true";
  const compact = compactParam === "true";

  const [event, scheduleTypes, dashboardChoices, data] = await Promise.all([
    getEvent(eventId),
    getOptions("schedule_type"),
    listShareLinkGroupChoicesForEvent(eventId),
    getEventScheduleData(eventId, {
      types: selectedTypes.length > 0 ? selectedTypes : undefined,
      includeNonPublic,
    }),
  ]);

  if (!event || !data) notFound();

  const validTypeLabels = new Set(scheduleTypes.map((t) => t.label));
  const effectiveTypes = selectedTypes.filter((t) => validTypeLabels.has(t));

  const typeOptions = scheduleTypes.map((t) => ({ value: t.label, label: t.label }));

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Event Schedule" },
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
          scheduleTypes={typeOptions}
          selectedTypes={effectiveTypes}
          includeNonPublic={includeNonPublic}
          compact={compact}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="EVENT_SCHEDULE"
              currentFilters={{ types: effectiveTypes, includeNonPublic, compact }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <ReportPaper title="Event Schedule">
          <EventScheduleReport
            data={data}
            scheduleTypes={scheduleTypes}
            includeNonPublic={includeNonPublic}
            compact={compact}
          />
        </ReportPaper>
      </div>
    </>
  );
}
