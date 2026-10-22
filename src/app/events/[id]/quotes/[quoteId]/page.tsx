import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { Toast } from "@/components/Toast";
import { getOptions } from "@/app/settings/actions";
import { btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { dateKey } from "@/lib/hotels";
import { prisma } from "@/lib/prisma";
import { QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS } from "@/lib/rfp/quotes";
import { getEvent } from "../../../actions";
import { awardVendorQuote, deleteVendorQuote, getQuoteFormChoices, getVendorQuote, saveVendorQuote } from "../../../quotes/actions";
import { quoteResource } from "../../../quotes/core";
import { AwardQuoteButton } from "../../../quotes/AwardQuoteButton";
import { VendorQuoteForm } from "../../../quotes/VendorQuoteForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quote" };

export default async function VendorQuotePage({ params }: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id: eventId, quoteId } = await params;
  const [event, quote, fileTypeOptions] = await Promise.all([getEvent(eventId), getVendorQuote(quoteId, eventId), getOptions("file_type")]);
  if (!event || !quote) notFound();
  const [choices, otherOpen] = await Promise.all([
    getQuoteFormChoices(eventId, quote.rfpId),
    quote.rfpId ? prisma.vendorQuote.count({ where: { rfpId: quote.rfpId, eventId, id: { not: quoteId }, status: "RECEIVED" } }) : 0,
  ]);
  const resource = quoteResource(quote.rfp);
  const base = `/events/${eventId}/quotes/${quoteId}`;

  const saveAction = async (formData: FormData) => {
    "use server";
    return saveVendorQuote(quoteId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteVendorQuote(quoteId, eventId);
  };
  const awardAction = async (declineOthers: boolean) => {
    "use server";
    await awardVendorQuote(quoteId, eventId, declineOthers);
  };
  const str = (v: { toString(): string } | null) => (v == null ? null : v.toString());
  const day = (d: Date | null) => (d ? dateKey(d) : null);

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs", href: `/events/${eventId}/rfps` },
          ...(quote.rfp ? [{ label: quote.rfp.title, href: `/events/${eventId}/rfps/${quote.rfp.id}` }] : []),
          { label: `${quote.vendor.name} quote` },
        ]}
        title={quote.vendor.name}
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[QUOTE_STATUS_COLORS[quote.status]]}`}>{QUOTE_STATUS_LABELS[quote.status]}</span>
            <LastUpdated updatedAt={quote.updatedAt} updatedBy={quote.updatedBy} timezone={event.timezone} />
          </div>
        }
        actions={
          <>
            {quote.rfp && (
              <Link href={`/events/${eventId}/rfps/${quote.rfp.id}/compare`} className={btnSecondary}>
                Compare quotes
              </Link>
            )}
            {quote.status !== "ACCEPTED" && <AwardQuoteButton action={awardAction} resource={resource} otherOpen={otherOpen} />}
            <DeleteButton action={deleteAction} resource={resource} label="Delete quote" />
          </>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 min-w-0">
          {/* Autosaves; not keyed on updatedAt, or each save would remount it. */}
          <VendorQuoteForm
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
            save={saveAction}
          />
        </div>
        <div className="min-w-0">
          <FileUploadPanel entityType="vendorQuote" entityId={quoteId} files={quote.files} fileTypeOptions={fileTypeOptions} revalidateTarget={base} />
        </div>
      </div>
    </>
  );
}
