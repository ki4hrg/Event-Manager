import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/event";
import { getEventScheduleData } from "@/app/events/reports/data";
import { getOptions } from "@/app/(admin)/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { EventScheduleReport } from "../EventScheduleReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event schedule (print)" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function EventSchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ types?: string; includeNonPublic?: string; compact?: string }>;
}) {
  const { id: eventId } = await params;
  const { types: typesParam, includeNonPublic: nonPublicParam, compact: compactParam } = await searchParams;

  const selectedTypes = parseListParam(typesParam);
  const includeNonPublic = nonPublicParam === "true";
  const compact = compactParam === "true";

  const qs = new URLSearchParams({
    ...(typesParam ? { types: typesParam } : {}),
    ...(includeNonPublic ? { includeNonPublic: "true" } : {}),
    ...(compact ? { compact: "true" } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/event-schedule${qs ? `?${qs}` : ""}`;

  const [event, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getOptions("schedule_type"),
  ]);

  if (!event) notFound();

  const validTypeLabels = new Set(scheduleTypes.map((t) => t.label));
  const effectiveTypes = selectedTypes.filter((t) => validTypeLabels.has(t));

  const data = await getEventScheduleData(eventId, {
    types: effectiveTypes.length > 0 ? effectiveTypes : undefined,
    includeNonPublic,
  });

  if (!data) notFound();

  return (
    <>
      <style>{`@page { margin: 0.5in; }`}</style>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
        <div className="print:hidden">
          <PrintHeader eventName={event.name} title="Event Schedule" backHref={backHref} />
        </div>
        <EventScheduleReport
          data={data}
          scheduleTypes={scheduleTypes}
          includeNonPublic={includeNonPublic}
          compact={compact}
        />
      </div>
    </>
  );
}
