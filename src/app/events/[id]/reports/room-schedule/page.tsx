import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/actions";
import { getRoomScheduleData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { getOptions } from "@/app/settings/actions";
import { enumerateEventDays } from "../event-profile/days";
import { ReportFilters } from "./ReportFilters";
import { RoomScheduleReport } from "./RoomScheduleReport";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Room schedule" };

function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export default async function RoomSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; rooms?: string; usedOnly?: string; addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const { days: daysParam, rooms: roomsParam, usedOnly: usedOnlyParam, addToDashboard } = await searchParams;

  const selectedDays = parseListParam(daysParam);
  const selectedRoomIds = parseListParam(roomsParam);
  const usedOnly = usedOnlyParam === "true";

  const [event, data, functionTypes, scheduleTypes, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getRoomScheduleData(eventId, {
      days: selectedDays.length > 0 ? selectedDays : undefined,
      roomIds: selectedRoomIds.length > 0 ? selectedRoomIds : undefined,
    }),
    getOptions("function_type"),
    getOptions("schedule_type"),
    listShareLinkGroupChoicesForEvent(eventId),
  ]);

  if (!event || !data) notFound();

  const dayOptions = enumerateEventDays(
    event.startDate,
    event.endDate,
    event.timezone,
    data.availableDayKeys
  );
  const roomOptions = data.rooms.map((r) => ({
    value: r.id,
    label: r.venue?.name ? `${r.name} · ${r.venue.name}` : r.name,
    groupId: r.group?.id ?? null,
    groupName: r.group?.name ?? null,
    groupSortOrder: r.group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
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
        <AddToDashboardBanner
          eventId={eventId}
          addToDashboardId={addToDashboard}
          dashboardChoices={dashboardChoices}
        />

        <ReportFilters
          eventId={eventId}
          days={dayOptions}
          rooms={roomOptions}
          selectedDays={selectedDays}
          selectedRoomIds={selectedRoomIds}
          usedOnly={usedOnly}
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="ROOM_SCHEDULE"
              currentFilters={{ days: selectedDays, rooms: selectedRoomIds, usedOnly }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />

        <ReportPaper title="Room Schedule">
          <RoomScheduleReport
            data={data}
            functionTypes={functionTypes}
            scheduleTypes={scheduleTypes}
            usedOnly={usedOnly}
          />
        </ReportPaper>
      </div>
    </>
  );
}
