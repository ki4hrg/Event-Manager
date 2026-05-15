import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import { getRoomScheduleData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { enumerateEventDays } from "../event-profile/days";
import { ReportFilters } from "./ReportFilters";
import { RoomScheduleReport } from "./RoomScheduleReport";
import { ShareReportButton } from "@/components/ShareReportButton";

export const dynamic = "force-dynamic";

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function RoomSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; rooms?: string }>;
}) {
  const { id: eventId } = await params;
  const { days: daysParam, rooms: roomsParam } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const selectedRoomIds = parseListParam(roomsParam);

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

  const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);
  const roomOptions = data.rooms.map((r) => ({
    value: r.id,
    label: r.venue?.name ? `${r.name} · ${r.venue.name}` : r.name,
  }));

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Room Schedule" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <div className="max-w-5xl">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Room Schedule</h2>

        <ReportFilters
          eventId={eventId}
          days={dayOptions}
          rooms={roomOptions}
          selectedDays={selectedDays}
          selectedRoomIds={selectedRoomIds}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="ROOM_SCHEDULE"
              currentFilters={{ days: selectedDays, rooms: selectedRoomIds }}
            />
          }
        />

        <RoomScheduleReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
        />
      </div>
    </>
  );
}
