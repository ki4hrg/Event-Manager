import type { Metadata } from "next";
import { PageWrapper } from "@/components/PageWrapper";
import { createVenue } from "../actions";
import { VenueForm } from "../VenueForm";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New venue" };

export default async function NewVenuePage() {
  // A VIEW-only user has no business on a create form.
  await requirePermission("VENUES", "WRITE");
  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        New Venue
      </h1>
      <VenueForm action={createVenue} />
    </PageWrapper>
  );
}
