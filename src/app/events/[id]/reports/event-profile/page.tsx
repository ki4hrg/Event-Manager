import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import { getEventProfileData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { getOptions } from "@/app/settings/actions";
import { enumerateEventDays } from "./days";
import { ReportFilters } from "./ReportFilters";
import {
  EventProfileReport,
  PROFILE_SECTIONS,
  resolveScheduleTypeFilter,
  type ProfileSection,
} from "./EventProfileReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    days?: string;
    sections?: string;
    scheduleTypes?: string;
    addToDashboard?: string;
  }>;
}) {
  const { id: eventId } = await params;
  const {
    days: daysParam,
    sections: sectionsParam,
    scheduleTypes: scheduleTypesParam,
    addToDashboard,
  } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
  const selectedSections = parseListParam(sectionsParam).filter((s) =>
    validSectionValues.has(s as ProfileSection)
  ) as ProfileSection[];

  const [event, data, functionTypes, scheduleTypes, serviceStyles, dashboardChoices] =
    await Promise.all([
      getEvent(eventId),
      getEventProfileData(eventId, { days: selectedDays.length > 0 ? selectedDays : undefined }),
      getOptions("function_type"),
      getOptions("schedule_type"),
      getOptions("service_style"),
      listShareLinkGroupChoicesForEvent(eventId),
    ]);

  if (!event || !data) notFound();

  const selectedScheduleTypes = resolveScheduleTypeFilter(
    scheduleTypes,
    scheduleTypesParam !== undefined ? parseListParam(scheduleTypesParam) : undefined,
    scheduleTypesParam !== undefined,
  );

  const scheduleTypeOptions = scheduleTypes.map((t) => ({ value: t.label, label: t.label }));

  const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Event Profile" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Event Profile</h2>

        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          days={dayOptions}
          scheduleTypeOptions={scheduleTypeOptions}
          selectedDays={selectedDays}
          selectedSections={selectedSections}
          selectedScheduleTypes={selectedScheduleTypes}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="EVENT_PROFILE"
              currentFilters={{
                days: selectedDays,
                sections: selectedSections,
                scheduleTypes: selectedScheduleTypes,
              }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <EventProfileReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
          serviceStyles={serviceStyles}
          selectedSections={selectedSections}
          selectedScheduleTypes={selectedScheduleTypes}
        />
      </div>
    </>
  );
}
