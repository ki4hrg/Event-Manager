import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getEventProfileData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import {
  EventProfileReport,
  PROFILE_SECTIONS,
  resolveScheduleTypeFilter,
  type ProfileSection,
} from "../EventProfileReport";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventProfilePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; sections?: string; scheduleTypes?: string }>;
}) {
  const { id: eventId } = await params;
  const {
    days: daysParam,
    sections: sectionsParam,
    scheduleTypes: scheduleTypesParam,
  } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
  const selectedSections = parseListParam(sectionsParam).filter((s) =>
    validSectionValues.has(s as ProfileSection)
  ) as ProfileSection[];

  const qs = new URLSearchParams({
    ...(daysParam ? { days: daysParam } : {}),
    ...(sectionsParam ? { sections: sectionsParam } : {}),
    ...(scheduleTypesParam !== undefined ? { scheduleTypes: scheduleTypesParam } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/event-profile${qs ? `?${qs}` : ""}`;

  const [event, data, functionTypes, scheduleTypes, serviceStyles] = await Promise.all([
    getEvent(eventId),
    getEventProfileData(eventId, { days: selectedDays.length > 0 ? selectedDays : undefined }),
    getOptions("function_type"),
    getOptions("schedule_type"),
    getOptions("service_style"),
  ]);

  if (!event || !data) notFound();

  const selectedScheduleTypes = resolveScheduleTypeFilter(
    scheduleTypes,
    scheduleTypesParam !== undefined ? parseListParam(scheduleTypesParam) : undefined,
    scheduleTypesParam !== undefined,
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title="Event Profile" backHref={backHref} />
      <EventProfileReport
        data={data}
        functionTypes={functionTypes}
        scheduleTypes={scheduleTypes}
        serviceStyles={serviceStyles}
        selectedSections={selectedSections}
        selectedScheduleTypes={selectedScheduleTypes}
      />
    </div>
  );
}
