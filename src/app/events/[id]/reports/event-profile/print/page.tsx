import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getEventProfileData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "../EventProfileReport";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventProfilePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; sections?: string }>;
}) {
  const { id: eventId } = await params;
  const { days: daysParam, sections: sectionsParam } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
  const selectedSections = parseListParam(sectionsParam).filter((s) =>
    validSectionValues.has(s as ProfileSection)
  ) as ProfileSection[];

  const qs = new URLSearchParams({
    ...(daysParam ? { days: daysParam } : {}),
    ...(sectionsParam ? { sections: sectionsParam } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/event-profile${qs ? `?${qs}` : ""}`;

  const [event, data, functionTypes, serviceStyles] = await Promise.all([
    getEvent(eventId),
    getEventProfileData(eventId, { days: selectedDays.length > 0 ? selectedDays : undefined }),
    getOptions("function_type"),
    getOptions("service_style"),
  ]);

  if (!event || !data) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title="Event Profile" backHref={backHref} />
      <EventProfileReport
        data={data}
        functionTypes={functionTypes}
        serviceStyles={serviceStyles}
        selectedSections={selectedSections}
      />
    </div>
  );
}
