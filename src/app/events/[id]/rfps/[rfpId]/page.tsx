import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { Toast } from "@/components/Toast";
import { getOptions } from "@/app/(admin)/settings/actions";
import { getInboundEmailDomain } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/hotels";
import { resourceForKind, rfpHref } from "@/lib/rfp/kinds";
import { ORDER_SOURCE } from "@/lib/rfp/lineItems";
import { getEvent } from "@/app/events/event";
import type { RfpConcessionArgs, RfpLineItemArgs, RfpRecipientArgs } from "../../../rfps/core";
import {
  addRfpVendorRecipients,
  deleteRfp,
  getRfp,
  getRfpDocument,
  getRfpFormChoices,
  getRfpLineItemCandidates,
  getRfpVendorChoices,
  issueRfp,
  removeRfpRecipient,
  saveRfpConcessions,
  saveRfpLineItems,
  updateRfp,
  updateRfpRecipient,
} from "../../../rfps/actions";
import { RfpConcessionsEditor } from "../../../rfps/RfpConcessionsEditor";
import { RfpDocumentView } from "../../../rfps/RfpDocumentView";
import { RfpForm } from "../../../rfps/RfpForm";
import { RfpHeader } from "../../../rfps/RfpHeader";
import { RfpLineItemsEditor } from "../../../rfps/RfpLineItemsEditor";
import { RfpTabs } from "../../../rfps/RfpTabs";
import { VendorRfpRecipients } from "../../../rfps/VendorRfpRecipients";
import { recordNoAward } from "../../../quotes/actions";
import { NoAwardButton } from "../../../quotes/NoAwardButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RFP" };

// A vendor RFP (AV, catering, print, other services); a hotel RFP's id
// redirects to its page under Hotels. The cards autosave and aren't keyed on their data: a remount after
// each save would drop the field being typed in.
export default async function VendorRfpPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; rfpId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id: eventId, rfpId } = await params;
  const preview = (await searchParams).view === "preview";
  const [event, rfp, fileTypeOptions, doc] = await Promise.all([
    getEvent(eventId),
    getRfp(rfpId, eventId),
    getOptions("file_type"),
    preview ? getRfpDocument(rfpId, eventId) : null,
  ]);
  if (!event || !rfp) notFound();
  if (rfp.kind === "HOTEL") redirect(rfpHref(eventId, rfp.kind, rfpId));
  const kind = rfp.kind;
  const resource = resourceForKind(kind);
  const [choices, vendors] = await Promise.all([getRfpFormChoices(eventId, kind), getRfpVendorChoices(eventId, kind)]);

  // Vendors can reply to the event's inbox.
  const domain = getInboundEmailDomain();
  const inbox = domain
    ? await prisma.event.findUnique({ where: { id: eventId }, select: { inboxSlug: true, tenant: { select: { slug: true } } } })
    : null;
  const replyTo = domain && inbox?.inboxSlug ? `${inbox.tenant.slug}.${inbox.inboxSlug}@${domain}` : null;

  const base = `/events/${eventId}/rfps/${rfpId}`;
  const updateAction = async (formData: FormData) => {
    "use server";
    await updateRfp(rfpId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteRfp(rfpId, eventId);
  };
  const issueAction = async () => {
    "use server";
    await issueRfp(rfpId, eventId);
  };
  const saveLinesAction = async (rows: RfpLineItemArgs[]) => {
    "use server";
    return saveRfpLineItems(rfpId, eventId, rows);
  };
  const candidatesAction = async () => {
    "use server";
    return getRfpLineItemCandidates(rfpId, eventId);
  };
  const saveTermsAction = async (terms: RfpConcessionArgs[]) => {
    "use server";
    return saveRfpConcessions(rfpId, eventId, terms);
  };
  const addRecipientsAction = async (vendorIds: string[]) => {
    "use server";
    await addRfpVendorRecipients(rfpId, eventId, vendorIds);
  };
  const updateRecipientAction = async (recipientId: string, args: RfpRecipientArgs) => {
    "use server";
    await updateRfpRecipient(recipientId, rfpId, eventId, args);
  };
  const noAwardAction = async () => {
    "use server";
    return recordNoAward(rfpId, eventId);
  };
  // "No award" while the RFP is open with quotes and none accepted.
  const openQuotes = rfp.quotes.filter((q) => q.status === "RECEIVED").length;
  const canNoAward = rfp.status !== "CLOSED" && rfp.quotes.length > 0 && !rfp.quotes.some((q) => q.status === "ACCEPTED");
  const removeRecipientAction = async (recipientId: string) => {
    "use server";
    await removeRfpRecipient(recipientId, rfpId, eventId);
  };
  const day = (d: Date | null) => (d ? dateKey(d) : null);
  const lineRows = rfp.lineItems.map(({ _count, ...l }) => ({ ...l, day: day(l.day), endDay: day(l.endDay) }));
  // Lines a quote prices: removing one turns those quote lines into extras.
  const pricedLines = rfp.lineItems.filter((l) => l._count.quoteLines > 0).map((l) => l.id);

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <RfpHeader event={event} rfp={rfp} responses={rfp.quotes.length} issue={issueAction} remove={deleteAction} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 min-w-0 space-y-6">
          <RfpTabs base={base} preview={preview} />
          {doc ? (
            <RfpDocumentView doc={doc} />
          ) : (
            <>
              <RfpForm
                kind={kind}
                resource={resource}
                values={{
                  title: rfp.title,
                  status: rfp.status,
                  service: rfp.service,
                  responseDue: day(rfp.responseDue),
                  decisionBy: day(rfp.decisionBy),
                  siteVisitBy: day(rfp.siteVisitBy),
                  decisionMakerId: rfp.decisionMakerId,
                  decisionMakerName: rfp.decisionMakerContact ? `${rfp.decisionMakerContact.firstName} ${rfp.decisionMakerContact.lastName}`.trim() : null,
                  decisionMaker: rfp.decisionMaker,
                  regions: [],
                  areas: [],
                  eventScope: { regions: [], areas: [] },
                  sections: rfp.sections,
                  introduction: rfp.introduction,
                  requirements: rfp.requirements,
                  contactId: rfp.contactId,
                  contactName: rfp.contact ? `${rfp.contact.firstName} ${rfp.contact.lastName}`.trim() : null,
                  arrivalDate: day(rfp.arrivalDate),
                  departureDate: day(rfp.departureDate),
                  datesFlexible: rfp.datesFlexible,
                  dateNotes: rfp.dateNotes,
                  alternateDates: rfp.alternateDates.map((a) => ({ startDate: dateKey(a.startDate), endDate: dateKey(a.endDate) })),
                  peakRooms: null,
                  multiProperty: false,
                  historyMatching: false,
                  reservationMethod: null,
                  commissionNotes: null,
                  fbMinimum: null,
                  fbIncludes: [],
                  fbHistoricalSpend: null,
                  amenities: [],
                }}
                choices={choices}
                action={updateAction}
              />
              {rfp.sections.includes("lineItems") && (
                <RfpLineItemsEditor
                  resource={resource}
                  rows={lineRows}
                  priced={pricedLines}
                  source={ORDER_SOURCE[kind]}
                  loadCandidates={candidatesAction}
                  save={saveLinesAction}
                  units={choices.units}
                />
              )}
              {rfp.sections.includes("concessions") && (
                <RfpConcessionsEditor
                  terms
                  resource={resource}
                  concessions={rfp.concessions.map((c) => ({ id: c.id, label: c.label, value: c.value, required: c.required }))}
                  options={choices.terms}
                  save={saveTermsAction}
                />
              )}
            </>
          )}
        </div>
        <div className="space-y-6 min-w-0">
          {domain && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Reply-to address</p>
              {replyTo ? (
                <p className="mt-1 font-mono text-gray-900 dark:text-white break-all select-all">{replyTo}</p>
              ) : (
                <Link href={`/events/${eventId}/settings#inbox`} className="mt-1 inline-block text-blue-600 dark:text-blue-400 hover:underline">
                  Set up the event inbox
                </Link>
              )}
            </div>
          )}
          <VendorRfpRecipients
            eventId={eventId}
            rfpId={rfpId}
            resource={resource}
            recipients={rfp.recipients.flatMap((r) =>
              r.vendor
                ? [
                    {
                      id: r.id,
                      vendorId: r.vendor.id,
                      name: r.vendor.name,
                      sentOn: r.sentOn ? dateKey(r.sentOn) : null,
                      declinedToBid: r.declinedToBid,
                      notes: r.notes,
                      quotes: rfp.quotes.filter((q) => q.vendorId === r.vendor!.id),
                    },
                  ]
                : [],
            )}
            responseDue={rfp.responseDue ? dateKey(rfp.responseDue) : null}
            today={dateKey(new Date())}
            vendors={vendors}
            add={addRecipientsAction}
            update={updateRecipientAction}
            remove={removeRecipientAction}
          />
          {canNoAward && <NoAwardButton action={noAwardAction} resource={resource} open={openQuotes} />}
          <FileUploadPanel entityType="rfp" entityId={rfpId} files={rfp.files} fileTypeOptions={fileTypeOptions} revalidateTarget={base} />
        </div>
      </div>
    </>
  );
}
