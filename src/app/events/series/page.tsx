import type { Metadata } from "next";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { hasPermission } from "@/lib/permissions";
import { formatEventDate } from "@/lib/agendaUtils";
import {
  getEventSeries,
  createEventSeries,
  updateEventSeries,
  deleteEventSeries,
} from "./actions";
import { SeriesList } from "./SeriesList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event series" };

export default async function EventSeriesPage() {
  const [series, canWrite, canDelete] = await Promise.all([
    getEventSeries(),
    hasPermission("EVENTS", "WRITE"),
    hasPermission("EVENTS", "DELETE"),
  ]);

  // Year label rather than the full event name — the series name already carries
  // the identity, so the editions read as "2024 · 2025 · 2026".
  const rows = series.map((s) => ({
    id: s.id,
    name: s.name,
    totalEvents: s._count.events,
    events: s.events.map((e) => ({
      id: e.id,
      name: e.name,
      year: formatEventDate(e.startDate, e.timezone, { year: "numeric" }),
    })),
  }));

  return (
    <PageWrapper>
      <PageHeader
        breadcrumbs={[{ label: "Events", href: "/events" }, { label: "Series" }]}
        title="Event Series"
        description="Group the yearly editions of a conference."
      />
      <SeriesList
        series={rows}
        canWrite={canWrite}
        canDelete={canDelete}
        createSeries={createEventSeries}
        updateSeries={updateEventSeries}
        deleteSeries={deleteEventSeries}
      />
    </PageWrapper>
  );
}
