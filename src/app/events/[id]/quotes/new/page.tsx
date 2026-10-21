import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../../../actions";
import { createVendorQuote, getQuoteFormChoices } from "../../../quotes/actions";
import { VendorQuoteForm } from "../../../quotes/VendorQuoteForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New quote" };

// A quote that answers no RFP.
export default async function NewStandaloneQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  await requirePermission("EVENTS", "WRITE", eventId);
  const [event, choices] = await Promise.all([getEvent(eventId), getQuoteFormChoices(eventId, null)]);
  if (!event) notFound();
  const createAction = async (formData: FormData) => {
    "use server";
    await createVendorQuote(eventId, null, formData);
  };
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs", href: `/events/${eventId}/rfps` },
          { label: "New quote" },
        ]}
        title="New quote"
      />
      <div className="max-w-4xl">
        <VendorQuoteForm resource="EVENTS" values={null} vendors={choices.vendors} lineItems={[]} action={createAction} cancelHref={`/events/${eventId}/rfps`} />
      </div>
    </>
  );
}
