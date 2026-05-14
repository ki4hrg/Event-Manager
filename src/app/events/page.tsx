import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { btnPrimary } from "@/lib/buttonStyles";
import { getEvents } from "./actions";
import { EventListClient } from "./EventListClient";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getEvents();

  return (
    <PageWrapper>
      <PageHeader
        title="Events"
        actions={
          <Link href="/events/new" className={btnPrimary}>
            New Event
          </Link>
        }
      />

      {events.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No events yet.{" "}
          <Link href="/events/new" className="text-blue-600 dark:text-blue-400 hover:underline">
            Create your first event
          </Link>
        </p>
      ) : (
        <EventListClient events={JSON.parse(JSON.stringify(events))} />
      )}
    </PageWrapper>
  );
}
