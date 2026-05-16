import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import { getEventProfileData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { getOptions } from "@/app/settings/actions";
import { enumerateEventDays } from "./days";
import { ReportFilters } from "./ReportFilters";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "./EventProfileReport";
import { ShareReportButton } from "@/components/ShareReportButton";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; sections?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { days: daysParam, sections: sectionsParam, addToDashboard } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
  const selectedSections = parseListParam(sectionsParam).filter((s) =>
    validSectionValues.has(s as ProfileSection)
  ) as ProfileSection[];

  const [event, data, functionTypes, serviceStyles, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getEventProfileData(eventId, { days: selectedDays.length > 0 ? selectedDays : undefined }),
    getOptions("function_type"),
    getOptions("service_style"),
    listShareLinkGroupChoicesForEvent(eventId),
  ]);

  if (!event || !data) notFound();

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

        <ReportFilters
          eventId={eventId}
          days={dayOptions}
          selectedDays={selectedDays}
          selectedSections={selectedSections}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="EVENT_PROFILE"
              currentFilters={{ days: selectedDays, sections: selectedSections }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <EventProfileReport
          data={data}
          functionTypes={functionTypes}
          serviceStyles={serviceStyles}
          selectedSections={selectedSections}
        />
      </div>
    </>
  );
}
