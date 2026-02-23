import { prisma } from "@/lib/prisma";
import { createEvent } from "../actions";
import { EventForm } from "../EventForm";

export default async function NewEventPage() {
  const venues = await prisma.venue.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        New Event
      </h1>
      <EventForm venues={venues} action={createEvent} />
    </div>
  );
}
