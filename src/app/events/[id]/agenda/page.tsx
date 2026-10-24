import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { prisma } from "@/lib/prisma";
import { getFunctionsWithPresentations } from "../../functions/actions";
import { buildAgendaData, serializeAgendaData } from "@/lib/agendaUtils";
import { getEventRooms } from "@/lib/eventVenues";
import { getOptions } from "@/app/(admin)/settings/actions";
import { requirePermission } from "@/lib/permissions";
import { getAgendaViewSettings, getAgendaRoomPrefs } from "@/lib/userSettings";
import dynamicImport from "next/dynamic";
const AgendaGrid = dynamicImport(() => import("./AgendaGrid").then((m) => m.AgendaGrid), { ssr: false });

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id: eventId } = await params;
  const { date } = await searchParams;

  const session = await requirePermission("FUNCTIONS", "VIEW", eventId);

  const [event, rooms, functions, scheduleTypes, agendaViewSettings, agendaRoomPrefs] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    getEventRooms(eventId),
    getFunctionsWithPresentations(eventId),
    getOptions("schedule_type"),
    getAgendaViewSettings(session.user.id),
    getAgendaRoomPrefs(session.user.id, eventId),
  ]);

  if (!event) {
    notFound();
  }

  const timezone = event.timezone || "America/Chicago";

  const scheduleTypeAttrs = new Map(scheduleTypes.map((t) => [t.label, { label: t.label, color: t.color }]));
  const agendaData = buildAgendaData(functions, rooms, timezone, scheduleTypeAttrs);

  const activeDate =
    date && agendaData.days.some((d) => d.dateKey === date)
      ? date
      : agendaData.days[0]?.dateKey ?? null;

  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Agenda" },
          ]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {activeDate && (
            <a
              href={`/events/${eventId}/agenda/print?date=${activeDate}`}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Print Day
            </a>
          )}
          <a
            href={`/events/${eventId}/agenda/print`}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
        </div>
      </div>

      <AgendaGrid
        eventId={eventId}
        agendaData={serializeAgendaData(agendaData)}
        timezone={timezone}
        activeDate={activeDate}
        initialSettings={agendaViewSettings}
        initialRoomPrefs={agendaRoomPrefs}
      />
    </>
  );

}
