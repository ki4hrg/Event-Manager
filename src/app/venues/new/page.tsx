import type { Metadata } from "next";
import { PageWrapper } from "@/components/PageWrapper";
import { createVenue } from "../actions";
import { VenueForm } from "../VenueForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New venue" };

export default function NewVenuePage() {
  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        New Venue
      </h1>
      <VenueForm action={createVenue} />
    </PageWrapper>
  );
}
