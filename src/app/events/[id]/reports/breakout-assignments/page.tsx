import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import {
  getBreakoutScheduleData,
  getBreakoutGroupOptions,
  getEventLastUpdate,
} from "@/app/events/reports/actions";
import { LastUpdated } from "@/components/LastUpdated";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ReportFilters } from "./ReportFilters";
import { BreakoutAssignmentsReport } from "./BreakoutAssignmentsReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function BreakoutAssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groups?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { groups: groupsParam, addToDashboard } = await searchParams;

  const selectedGroupIds = parseListParam(groupsParam);

  const [event, groupOptions, data, dashboardChoices, lastUpdate] = await Promise.all([
    getEvent(eventId),
    getBreakoutGroupOptions(eventId),
    getBreakoutScheduleData(eventId, {
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    }),
    listShareLinkGroupChoicesForEvent(eventId),
    getEventLastUpdate(eventId),
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
            { label: "Breakout Assignments" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
        {lastUpdate && (
          <LastUpdated
            updatedAt={lastUpdate.updatedAt}
            updatedBy={lastUpdate.updatedBy}
            timezone={event.timezone}
            className="mt-2"
          />
        )}
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Breakout Assignments
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
              reportType="BREAKOUT_ASSIGNMENTS"
              currentFilters={{ breakoutGroupIds: effectiveSelectedIds }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <BreakoutAssignmentsReport data={data} />
      </div>
    </>
  );
}
