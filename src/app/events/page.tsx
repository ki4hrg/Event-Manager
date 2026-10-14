import type { Metadata } from "next";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { hasPermission } from "@/lib/permissions";
import { getEvents, getEventSeriesOptions } from "./actions";
import { EventListClient, type CompletedFilter } from "./EventListClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ series?: string; completed?: string }>;
}) {
  const { series: seriesParam, completed: completedParam } = await searchParams;
  const completed: CompletedFilter =
    completedParam === "hide" || completedParam === "show" ? completedParam : "";

  const [seriesOptions, canWrite] = await Promise.all([
    getEventSeriesOptions(),
    hasPermission("EVENTS", "WRITE"),
  ]);

  // Guard the param against the real option set before it reaches the query, so
  // a stale or hand-typed ?series= doesn't silently render an empty list.
  const validSeries = new Set(seriesOptions.map((s) => s.id));
  const series =
    seriesParam === "__blank__" || (seriesParam && validSeries.has(seriesParam))
      ? seriesParam
      : "";

  const events = await getEvents(series);

  return (
    <PageWrapper>
      <PageHeader
        title="Events"
        actions={
          <>
            <Link href="/events/series" className={btnSecondary}>
              Series
            </Link>
            {canWrite && (
              <Link href="/events/new" className={btnPrimary}>
                New Event
              </Link>
            )}
          </>
        }
      />

      <EventListClient
        events={JSON.parse(JSON.stringify(events))}
        seriesOptions={seriesOptions}
        selectedSeries={series}
        completed={completed}
        canWrite={canWrite}
      />
    </PageWrapper>
  );
}
