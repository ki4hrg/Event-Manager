import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getEventProfileData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "../EventProfileReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event profile (print)" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventProfilePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; sections?: string; types?: string }>;
}) {
  const { id: eventId } = await params;
  const { days: daysParam, sections: sectionsParam, types: typesParam } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
  const selectedSections = parseListParam(sectionsParam).filter((s) =>
    validSectionValues.has(s as ProfileSection)
  ) as ProfileSection[];

  const qs = new URLSearchParams({
    ...(daysParam ? { days: daysParam } : {}),
    ...(sectionsParam ? { sections: sectionsParam } : {}),
    ...(typesParam ? { types: typesParam } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/event-profile${qs ? `?${qs}` : ""}`;

  const [event, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getOptions("schedule_type"),
  ]);

  if (!event) notFound();

  const validTypeValues = new Set(scheduleTypes.map((t) => t.label));
  const selectedTypes = parseListParam(typesParam).filter((v) => validTypeValues.has(v));

  const [data, serviceStyles] = await Promise.all([
    getEventProfileData(eventId, {
      days: selectedDays.length > 0 ? selectedDays : undefined,
      types: selectedTypes.length > 0 ? selectedTypes : undefined,
    }),
    getOptions("service_style"),
  ]);

  if (!data) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title="Event Profile" backHref={backHref} />
      <EventProfileReport
        data={data}
        serviceStyles={serviceStyles}
        scheduleTypes={scheduleTypes}
        selectedSections={selectedSections}
      />
    </div>
  );
}
