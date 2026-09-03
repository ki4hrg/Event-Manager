import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getPackingListData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { reportFooterText } from "@/lib/reportStyles";
import { PackingListReport } from "../PackingListReport";
import { parsePackingListParams } from "../params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Packing list (print)" };

export default async function PackingListPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    rooms?: string;
    packing?: string;
    acquisition?: string;
    providers?: string;
    hidePacked?: string;
  }>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  const selected = parsePackingListParams(sp);

  const qs = new URLSearchParams({
    ...(sp.rooms ? { rooms: sp.rooms } : {}),
    ...(sp.packing ? { packing: sp.packing } : {}),
    ...(sp.acquisition ? { acquisition: sp.acquisition } : {}),
    ...(sp.providers ? { providers: sp.providers } : {}),
    ...(selected.hidePacked ? { hidePacked: "true" } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/packing-list${qs ? `?${qs}` : ""}`;

  const [event, data] = await Promise.all([
    getEvent(eventId),
    getPackingListData(eventId, {
      rooms: selected.rooms.length > 0 ? selected.rooms : undefined,
      packingStatuses:
        selected.packingStatuses.length > 0 ? selected.packingStatuses : undefined,
      acquisitionStates:
        selected.acquisitionStates.length > 0 ? selected.acquisitionStates : undefined,
      providers: selected.providers.length > 0 ? selected.providers : undefined,
      hidePacked: selected.hidePacked,
    }),
  ]);

  if (!event || !data) notFound();

  const generated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title="Packing List" backHref={backHref} />
      <PackingListReport data={data} />
      <div
        className={`mt-6 pt-4 border-t border-gray-200 dark:border-gray-600 print:border-gray-400 flex justify-between ${reportFooterText}`}
      >
        <span>
          {data.summary.itemCount} item{data.summary.itemCount !== 1 ? "s" : ""} ·{" "}
          {data.summary.toProcureCount} to procure
        </span>
        <span>Generated {generated}</span>
      </div>
    </div>
  );
}
