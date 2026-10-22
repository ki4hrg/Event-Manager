import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/event";
import { getEsgData } from "@/app/events/reports/data";
import { PrintHeader } from "@/components/print/PrintHeader";
import { esgFiltersToQuery, parseEsgSearchParams, type EsgSearchParams } from "@/lib/esg/params";
import { EsgReport } from "../EsgReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event Specifications Guide (print)" };

export default async function EsgReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<EsgSearchParams>;
}) {
  const { id: eventId } = await params;
  const filters = parseEsgSearchParams(await searchParams);
  const [event, data] = await Promise.all([getEvent(eventId), getEsgData(eventId, filters)]);
  if (!event || !data) notFound();
  const qs = esgFiltersToQuery(data.applied);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PrintHeader
        eventName={event.name}
        title="Event Specifications Guide"
        backHref={`/events/${eventId}/reports/esg${qs ? `?${qs}` : ""}`}
      />
      <EsgReport doc={data.document} />
    </div>
  );
}
