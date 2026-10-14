import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getHotelInfoReportData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { requirePermission } from "@/lib/permissions";
import { parseBlockTypes } from "@/lib/hotels";
import { HotelInfoReport } from "../HotelInfoReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotel Information (print)" };

export default async function HotelInfoPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blockTypes?: string }>;
}) {
  const { id: eventId } = await params;
  const { blockTypes: raw } = await searchParams;
  await requirePermission("HOTELS", "VIEW", eventId);
  const [event, data] = await Promise.all([getEvent(eventId), getHotelInfoReportData(eventId, { blockTypes: parseBlockTypes(raw) })]);
  if (!event || !data) notFound();
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PrintHeader
        eventName={event.name}
        title="Hotel Information"
        backHref={`/events/${eventId}/reports/hotel-info${raw ? `?blockTypes=${encodeURIComponent(raw)}` : ""}`}
      />
      <HotelInfoReport data={data} />
    </div>
  );
}
