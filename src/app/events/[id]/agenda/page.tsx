import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { EventTabs } from "../EventTabs";
import { getFunctions } from "../../functions/actions";
import { buildAgendaData, serializeAgendaData } from "@/lib/agendaUtils";
import { AgendaGrid } from "./AgendaGrid";

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; hideEmpty?: string }>;
}) {
  const { id: eventId } = await params;
  const { date, hideEmpty: hideEmptyParam } = await searchParams;

  const [event, functions] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: { include: { rooms: { orderBy: { name: "asc" } } } },
      },
    }),
    getFunctions(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const timezone = event.timezone || "America/Chicago";
  const rooms = event.venue?.rooms ?? [];

  const agendaData = buildAgendaData(functions, rooms, timezone);

  const activeDate =
    date && agendaData.days.some((d) => d.dateKey === date)
      ? date
      : agendaData.days[0]?.dateKey ?? null;

  const hideEmpty = hideEmptyParam === "1";

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
