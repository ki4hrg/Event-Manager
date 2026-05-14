import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvents } from "./actions";
import { EventListClient } from "./EventListClient";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getEvents();

  return (
    <PageWrapper>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Events
        </h1>
        <Link
          href="/events/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          New Event
        </Link>
      </div>

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
