import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { EventTabs } from "../EventTabs";
import { getFunctionsWithPresentations } from "../../functions/actions";
import { buildAgendaData, serializeAgendaData } from "@/lib/agendaUtils";
import { getOptions } from "@/app/settings/actions";
import dynamicImport from "next/dynamic";
const AgendaGrid = dynamicImport(() => import("./AgendaGrid").then((m) => m.AgendaGrid), { ssr: false });

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; showAll?: string }>;
}) {
  const { id: eventId } = await params;
  const { date, showAll: showAllParam } = await searchParams;

  const [event, functions, scheduleTypes] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: { include: { rooms: { orderBy: { name: "asc" } } } },
      },
    }),
    getFunctionsWithPresentations(eventId),
    getOptions("schedule_type"),
  ]);

  if (!event) {
    notFound();
  }

  const timezone = event.timezone || "America/Chicago";
  const rooms = event.venue?.rooms ?? [];

  const scheduleTypeAttrs = new Map(scheduleTypes.map((t) => [t.value, { label: t.label, color: t.color }]));
  const agendaData = buildAgendaData(functions, rooms, timezone, scheduleTypeAttrs);

  const activeDate =
    date && agendaData.days.some((d) => d.dateKey === date)
      ? date
      : agendaData.days[0]?.dateKey ?? null;

  const hideEmpty = showAllParam !== "1";

  return (
    <PageWrapper>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <AgendaGrid
        eventId={eventId}
        agendaData={serializeAgendaData(agendaData)}
        timezone={timezone}
        activeDate={activeDate}
        hideEmpty={hideEmpty}
      />
    </PageWrapper>
  );
}
