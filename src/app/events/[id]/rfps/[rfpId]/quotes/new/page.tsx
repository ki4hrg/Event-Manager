import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requirePermission } from "@/lib/permissions";
import { resourceForKind } from "@/lib/rfp/kinds";
import { getEvent } from "../../../../../actions";
import { getRfp } from "../../../../../rfps/actions";
import { createVendorQuote, getQuoteFormChoices } from "../../../../../quotes/actions";
import { VendorQuoteForm } from "../../../../../quotes/VendorQuoteForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Record quote" };

// A vendor's answer to a vendor RFP; ?vendorId= picks the vendor.
export default async function NewRfpQuotePage({ params, searchParams }: { params: Promise<{ id: string; rfpId: string }>; searchParams: Promise<{ vendorId?: string }> }) {
  const { id: eventId, rfpId } = await params;
  const { vendorId } = await searchParams;
  const [event, rfp] = await Promise.all([getEvent(eventId), getRfp(rfpId, eventId)]);
  if (!event || !rfp || rfp.kind === "HOTEL") notFound();
  const resource = resourceForKind(rfp.kind);
  await requirePermission(resource, "WRITE", eventId);
  const choices = await getQuoteFormChoices(eventId, rfpId);
  const createAction = async (formData: FormData) => {
    "use server";
    await createVendorQuote(eventId, rfpId, formData);
  };
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs", href: `/events/${eventId}/rfps` },
          { label: rfp.title, href: `/events/${eventId}/rfps/${rfpId}` },
          { label: "Record quote" },
        ]}
        title="Record quote"
      />
      <div className="max-w-4xl">
        <VendorQuoteForm
          resource={resource}
          values={null}
          vendors={choices.vendors}
          lineItems={choices.lineItems}
          defaultVendorId={choices.vendors.some((v) => v.id === vendorId) ? vendorId : undefined}
          action={createAction}
          cancelHref={`/events/${eventId}/rfps/${rfpId}`}
        />
      </div>
    </>
  );
}
