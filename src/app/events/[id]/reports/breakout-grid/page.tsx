import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import {
  getBreakoutScheduleData,
  getBreakoutGroupOptions,
} from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ReportFilters } from "./ReportFilters";
import { BreakoutGridReport } from "./BreakoutGridReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Breakout grid" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function BreakoutGridPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groups?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { groups: groupsParam, addToDashboard } = await searchParams;

  const selectedGroupIds = parseListParam(groupsParam);

  const [event, groupOptions, data, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getBreakoutGroupOptions(eventId),
    getBreakoutScheduleData(eventId, {
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    }),
    listShareLinkGroupChoicesForEvent(eventId),
  ]);

  if (!event || !data) notFound();

  const validGroupIds = new Set(groupOptions.map((g) => g.id));
  const effectiveSelectedIds = selectedGroupIds.filter((id) => validGroupIds.has(id));

  const groupChoices = groupOptions.map((g) => ({ value: g.id, label: g.name }));

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Breakout Grid" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Breakout Grid
        </h2>

        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          groups={groupChoices}
          selectedGroupIds={effectiveSelectedIds}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="BREAKOUT_GRID"
              currentFilters={{ breakoutGroupIds: effectiveSelectedIds }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <BreakoutGridReport data={data} />
      </div>
    </>
  );
}
