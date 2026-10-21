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
import { getInboundEmailDomain } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { dateKey } from "@/lib/hotels";
import { RFP_KIND_LABELS, resourceForKind } from "@/lib/rfp/kinds";
import { ORDER_SOURCE } from "@/lib/rfp/lineItems";
import { RFP_STATUS_COLORS, RFP_STATUS_LABELS } from "@/lib/rfp/sections";
import { getEvent } from "../../../actions";
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
import { IssueRfpButton } from "../../../rfps/IssueRfpButton";
import { RfpConcessionsEditor } from "../../../rfps/RfpConcessionsEditor";
import { RfpDocumentView } from "../../../rfps/RfpDocumentView";
import { RfpForm } from "../../../rfps/RfpForm";
import { RfpLineItemsEditor } from "../../../rfps/RfpLineItemsEditor";
import { RfpTabs } from "../../../rfps/RfpTabs";
import { VendorRfpRecipients } from "../../../rfps/VendorRfpRecipients";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RFP" };

// A vendor RFP (AV, catering, print, other services). Hotel RFPs live under
// Hotels. The cards autosave and aren't keyed on their data: a remount after
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
  if (!event || !rfp || rfp.kind === "HOTEL") notFound();
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
  const removeRecipientAction = async (recipientId: string) => {
    "use server";
    await removeRfpRecipient(recipientId, rfpId, eventId);
  };
  const day = (d: Date | null) => (d ? dateKey(d) : null);
  const lineRows = rfp.lineItems.map((l) => ({ ...l, day: day(l.day), endDay: day(l.endDay) }));

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
              { label: rfp.title },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">
            {rfp.title}
            <span className={`ml-2 align-middle px-2 py-0.5 rounded text-xs font-medium ${colorClasses[RFP_STATUS_COLORS[rfp.status]]}`}>
              {RFP_STATUS_LABELS[rfp.status]}
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{kind === "OTHER" ? (rfp.service ?? RFP_KIND_LABELS[kind]) : RFP_KIND_LABELS[kind]}</p>
          <LastUpdated updatedAt={rfp.updatedAt} updatedBy={rfp.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {rfp.quotes.length > 0 && (
            <Link href={`${base}/compare`} className={btnSecondary}>
              Compare quotes
            </Link>
          )}
          <Link href={`${base}/print`} className={btnSecondary}>
            Print / Save PDF
          </Link>
          <a href={`/api/events/${eventId}/rfps/${rfpId}?format=docx`} className={btnSecondary} download>
            Word
          </a>
          <IssueRfpButton action={issueAction} resource={resource} reissue={rfp.issuedOn != null} />
          <DeleteButton action={deleteAction} resource={resource} label="Delete RFP" />
        </div>
      </div>

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
                  source={ORDER_SOURCE[kind]}
                  loadCandidates={candidatesAction}
                  save={saveLinesAction}
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
          <FileUploadPanel entityType="rfp" entityId={rfpId} files={rfp.files} fileTypeOptions={fileTypeOptions} revalidateTarget={base} />
        </div>
      </div>
    </>
  );
}
