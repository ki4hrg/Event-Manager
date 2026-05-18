import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getRoomScheduleData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { RoomScheduleReport } from "../RoomScheduleReport";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function RoomSchedulePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; rooms?: string; usedOnly?: string }>;
}) {
  const { id: eventId } = await params;
  const { days: daysParam, rooms: roomsParam, usedOnly: usedOnlyParam } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const selectedRoomIds = parseListParam(roomsParam);
  const usedOnly = usedOnlyParam === "true";

  const qs = new URLSearchParams({
    ...(daysParam ? { days: daysParam } : {}),
    ...(roomsParam ? { rooms: roomsParam } : {}),
    ...(usedOnly ? { usedOnly: "true" } : {}),
  }).toString();
  const backHref = `/events/${eventId}/reports/room-schedule${qs ? `?${qs}` : ""}`;

  const [event, data, functionTypes, scheduleTypes] = await Promise.all([
    getEvent(eventId),
    getRoomScheduleData(eventId, {
      days: selectedDays.length > 0 ? selectedDays : undefined,
      roomIds: selectedRoomIds.length > 0 ? selectedRoomIds : undefined,
    }),
    getOptions("function_type"),
    getOptions("schedule_type"),
  ]);

  if (!event || !data) notFound();

  return (
    <>
      <style>{`@page { margin: 0.5in; }`}</style>
      <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
        <div className="print:hidden">
          <PrintHeader eventName={event.name} title="Room Schedule" backHref={backHref} />
        </div>
        <RoomScheduleReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
          usedOnly={usedOnly}
        />
      </div>
    </>
  );
}
