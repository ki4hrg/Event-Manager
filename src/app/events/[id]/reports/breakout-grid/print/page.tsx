import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/event";
import { getBreakoutScheduleData } from "@/app/events/reports/data";
import { PrintHeader } from "@/components/print/PrintHeader";
import { BreakoutGridPrintView } from "../BreakoutGridPrintView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Breakout grid (print)" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function BreakoutGridPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groups?: string }>;
}) {
  const { id: eventId } = await params;
  const { groups: groupsParam } = await searchParams;

  const selectedGroupIds = parseListParam(groupsParam);

  const qs = new URLSearchParams({
    ...(groupsParam ? { groups: groupsParam } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/breakout-grid${qs ? `?${qs}` : ""}`;

  const [event, data] = await Promise.all([
    getEvent(eventId),
    getBreakoutScheduleData(eventId, {
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    }),
  ]);

  if (!event || !data) notFound();

  return (
    <>
      <div className="p-6 print:hidden">
        <PrintHeader eventName={event.name} title="Breakout Grid" backHref={backHref} />
      </div>
      <BreakoutGridPrintView data={data} eventName={event.name} />
    </>
  );
}
