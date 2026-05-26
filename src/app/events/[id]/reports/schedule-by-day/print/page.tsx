import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getEventScheduleData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { ScheduleByDayReport } from "../ScheduleByDayReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Schedule by day (print)" };

export default async function ScheduleByDayPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ includeNonPublic?: string }>;
}) {
  const { id: eventId } = await params;
  const { includeNonPublic: nonPublicParam } = await searchParams;

  const includeNonPublic = nonPublicParam === "true";

  const qs = new URLSearchParams({
    ...(includeNonPublic ? { includeNonPublic: "true" } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/schedule-by-day${qs ? `?${qs}` : ""}`;

  const [event, data] = await Promise.all([
    getEvent(eventId),
    getEventScheduleData(eventId, { includeNonPublic }),
  ]);

  if (!event || !data) notFound();

  return (
    <>
      <style>{`@page { margin: 0.5in; }`}</style>
      <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
        <div className="print:hidden">
          <PrintHeader eventName={event.name} title="Schedule by Day" backHref={backHref} />
        </div>
        <ScheduleByDayReport data={data} includeNonPublic={includeNonPublic} />
      </div>
    </>
  );
}
