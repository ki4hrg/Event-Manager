import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { createEvent } from "../actions";
import { EventForm } from "../EventForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const venues = await prisma.venue.findMany({ orderBy: { name: "asc" } });

  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        New Event
      </h1>
      <EventForm venues={venues} action={createEvent} />
    </PageWrapper>
  );
}
