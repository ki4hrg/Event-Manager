import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent, updateEvent, deleteEvent } from "../actions";
import { EventForm } from "../EventForm";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  const venues = await prisma.venue.findMany({ orderBy: { name: "asc" } });

  const updateEventWithId = async (formData: FormData) => {
    "use server";
    await updateEvent(id, formData);
  };

  const deleteEventAction = async () => {
    "use server";
    await deleteEvent(id);
  };

  return (
    <PageWrapper>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/events"
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            ← Back to Events
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
        <form action={deleteEventAction}>
          <button
            type="submit"
            className="px-4 py-2 text-red-600 border border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={(e) => {
              if (!confirm("Are you sure you want to delete this event?")) {
                e.preventDefault();
              }
            }}
          >
            Delete
          </button>
        </form>
      </div>

      <EventForm venues={venues} event={event} action={updateEventWithId} />
    </PageWrapper>
  );
}
