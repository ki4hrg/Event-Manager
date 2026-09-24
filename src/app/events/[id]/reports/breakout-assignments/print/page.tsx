import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getBreakoutScheduleData } from "@/app/events/reports/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { BreakoutAssignmentsReport } from "../BreakoutAssignmentsReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Breakout assignments (print)" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function BreakoutAssignmentsPrintPage({
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
  const backHref = `/events/${eventId}/reports/breakout-assignments${qs ? `?${qs}` : ""}`;

  const [event, data] = await Promise.all([
    getEvent(eventId),
    getBreakoutScheduleData(eventId, {
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    }),
  ]);

  if (!event || !data) notFound();

  return (
    <>
      <style>{`@page { margin: 0.5in; }`}</style>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
        <PrintHeader
          eventName={event.name}
          title="Breakout Assignments"
          backHref={backHref}
        />
        <BreakoutAssignmentsReport data={data} />
      </div>
    </>
  );
}
