import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { Toast } from "@/components/Toast";
import { getOptions } from "@/app/settings/actions";
import { colorClasses } from "@/lib/colors";
import { dateKey } from "@/lib/hotels";
import { QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS } from "@/lib/rfp/quotes";
import { getEvent } from "../../../actions";
import { awardVendorQuote, deleteVendorQuote, getQuoteFormChoices, getVendorQuote, updateVendorQuote } from "../../../quotes/actions";
import { quoteResource } from "../../../quotes/core";
import { AwardQuoteButton } from "../../../quotes/AwardQuoteButton";
import { VendorQuoteForm } from "../../../quotes/VendorQuoteForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quote" };

export default async function VendorQuotePage({ params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id: eventId, quoteId } = await params;
  const [event, quote, fileTypeOptions] = await Promise.all([getEvent(eventId), getVendorQuote(quoteId, eventId), getOptions("file_type")]);
  if (!event || !quote) notFound();
  const choices = await getQuoteFormChoices(eventId, quote.rfpId);
  const resource = quoteResource(quote.rfp);
  const base = `/events/${eventId}/quotes/${quoteId}`;

  const updateAction = async (formData: FormData) => {
    "use server";
    await updateVendorQuote(quoteId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteVendorQuote(quoteId, eventId);
  };
  const awardAction = async () => {
    "use server";
    await awardVendorQuote(quoteId, eventId);
  };
  const str = (v: { toString(): string } | null) => (v == null ? null : v.toString());
  const day = (d: Date | null) => (d ? dateKey(d) : null);

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "RFPs", href: `/events/${eventId}/rfps` },
              ...(quote.rfp ? [{ label: quote.rfp.title, href: `/events/${eventId}/rfps/${quote.rfp.id}` }] : []),
              { label: `${quote.vendor.name} quote` },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">
            {quote.vendor.name}
            <span className={`ml-2 align-middle px-2 py-0.5 rounded text-xs font-medium ${colorClasses[QUOTE_STATUS_COLORS[quote.status]]}`}>
              {QUOTE_STATUS_LABELS[quote.status]}
            </span>
          </h1>
          {quote.rfp && (
            <Link href={`/events/${eventId}/rfps/${quote.rfp.id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {quote.rfp.title}
            </Link>
          )}
          <LastUpdated updatedAt={quote.updatedAt} updatedBy={quote.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {quote.rfp && (
            <Link href={`/events/${eventId}/rfps/${quote.rfp.id}/compare`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline self-center">
              Compare quotes
            </Link>
          )}
          {quote.status !== "ACCEPTED" && <AwardQuoteButton action={awardAction} resource={resource} onRfp={quote.rfp != null} />}
          <DeleteButton action={deleteAction} resource={resource} label="Delete quote" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 min-w-0">
          <VendorQuoteForm
            key={quote.updatedAt.toISOString()}
            resource={resource}
            values={{
              vendorId: quote.vendorId,
              reference: quote.reference,
              submittedOn: day(quote.submittedOn),
              validUntil: day(quote.validUntil),
              revision: quote.revision,
              serviceCharge: str(quote.serviceCharge),
              tax: str(quote.tax),
              otherFees: str(quote.otherFees),
              depositAmount: str(quote.depositAmount),
              depositDue: day(quote.depositDue),
              cancellationTerms: quote.cancellationTerms,
              notes: quote.notes,
              lines: quote.lines.map((l) => ({
                id: l.id,
                rfpLineItemId: l.rfpLineItemId,
                description: l.description,
                quantity: str(l.quantity) ?? "",
                unitPrice: str(l.unitPrice) ?? "",
                amount: str(l.amount) ?? "",
                notes: l.notes ?? "",
              })),
            }}
            vendors={choices.vendors}
            lineItems={choices.lineItems}
            action={updateAction}
          />
        </div>
        <div className="min-w-0">
          <FileUploadPanel entityType="vendorQuote" entityId={quoteId} files={quote.files} fileTypeOptions={fileTypeOptions} revalidateTarget={base} />
        </div>
      </div>
    </>
  );
}
