import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getBreakoutScheduleData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { BreakoutGridReport } from "../BreakoutGridReport";

export const dynamic = "force-dynamic";

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
      <style>{`@page { size: landscape; margin: 0.5in; }`}</style>
      <div className="p-6 max-w-none mx-auto print:p-0">
        <PrintHeader
          eventName={event.name}
          title="Breakout Grid"
          backHref={backHref}
        />
        <BreakoutGridReport data={data} />
      </div>
    </>
  );
}
