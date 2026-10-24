import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { prisma } from "@/lib/prisma";
import { getEvent } from "@/app/events/event";
import {
  applyInboundCounts,
  applyInboundDecline,
  applyInboundGuests,
  applyInboundOffer,
  applyInboundRevision,
  applyInboundQuote,
  applyInboundBeo,
  applyInboundContract,
  getQuoteReview,
  getBeoReview,
  getContractReview,
  getDeclineReview,
  getOfferReview,
  getInboundOffers,
  skipInboundOffer,
  dismissInboundEmail,
  fileInboundAttachment,
  getInboxDestinationEvents,
  getInboxItem,
  getInboxReview,
  releaseInboundEmail,
  reparseInboundEmail,
  restoreInboundEmail,
  routeInboundEmail,
} from "../../../inbox/actions";
import { InboxItemView } from "../../../inbox/InboxItemView";
import { FileAttachmentButton, InboxItemActions } from "../../../inbox/InboxItemActions";
import { InboxProposalPanel } from "../../../inbox/InboxProposalPanel";
import { InboxReview } from "../../../inbox/InboxReview";
import { InboxDeclineReview } from "../../../inbox/InboxDeclineReview";
import { InboxOfferForm } from "../../../inbox/InboxOfferForm";
import { InboxOfferTabs } from "../../../inbox/InboxOfferTabs";
import { InboxSavedOffer } from "../../../inbox/InboxSavedOffer";
import { getHotelProposal } from "../../../hotels/actions";
import { InboxQuoteReview } from "../../../inbox/InboxQuoteReview";
import { InboxBeoReview } from "../../../inbox/InboxBeoReview";
import { InboxContractReview } from "../../../inbox/InboxContractReview";
import type { ContractTarget } from "@/lib/inboundParse";
import { hasPermission } from "@/lib/permissions";
import { canSeeDiagnostics } from "@/lib/tenant";
import { isParsingConfigured, type InboundProposal } from "@/lib/inboundParse";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox item" };

export default async function EventInboxItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ offer?: string }>;
}) {
  const [{ id: eventId, itemId }, sp] = await Promise.all([params, searchParams]);
  // Triage is EVENTS WRITE; each review shows only to who may apply its kind
  // (quote and contract reviews filter their own choices).
  const [event, item, canTriage, canHotels, canCatering, canAddVenue, diagnostics] = await Promise.all([
    getEvent(eventId),
    getInboxItem(itemId, eventId),
    hasPermission("EVENTS", "WRITE", eventId),
    hasPermission("HOTELS", "WRITE", eventId),
    hasPermission("CATERING_ORDERS", "WRITE", eventId),
    hasPermission("VENUES", "WRITE"),
    canSeeDiagnostics(),
  ]);
  if (!event || !item) notFound();
  const proposal = item.proposal as InboundProposal | null;
  const parsing = isParsingConfigured();
  const kind = item.status === "PARSED" ? proposal?.kind : null;
  // A message can hold several hotels' offers: ?offer=<n> (1-based) picks
  // one, else the first still open.
  const offers = proposal?.kind === "RFP_PROPOSAL" ? await getInboundOffers(itemId, eventId) : [];
  const asked = parseInt(sp.offer ?? "") - 1;
  const offerIndex = asked >= 0 && asked < offers.length ? asked : Math.max(0, offers.findIndex((o) => o.state === "OPEN"));
  const [destinations, review, offer, decline, quote, beo, contract] = await Promise.all([
    canTriage ? getInboxDestinationEvents(eventId) : [],
    canHotels && (kind === "PICKUP_GUESTS" || kind === "PICKUP_COUNTS") ? getInboxReview(itemId, eventId) : null,
    canHotels && kind === "RFP_PROPOSAL" ? getOfferReview(itemId, eventId, offerIndex) : null,
    canHotels && kind === "RFP_DECLINE" ? getDeclineReview(itemId, eventId) : null,
    kind === "VENDOR_QUOTE" ? getQuoteReview(itemId, eventId) : null,
    canCatering && kind === "BEO" ? getBeoReview(itemId, eventId) : null,
    kind === "CONTRACT" ? getContractReview(itemId, eventId) : null,
  ]);
  const appliedProposals = offers.flatMap((o) =>
    o.proposalId ? [{ name: o.name, href: `/events/${eventId}/hotels/proposals/${o.proposalId}` }] : [],
  );
  const shownOffer = offers[offerIndex];
  // A saved offer's tab previews the proposal it became.
  const savedProposal =
    canHotels && offers.length > 1 && shownOffer?.proposalId ? await getHotelProposal(shownOffer.proposalId, eventId) : null;
  const appliedBlock =
    item.status === "APPLIED" && proposal?.blockId
      ? await prisma.hotelBlock.findFirst({
          where: { id: proposal.blockId, proposal: { eventId } },
          select: { id: true, proposal: { select: { venue: { select: { name: true } } } } },
        })
      : null;
  // Where an applied pickup, decline, quote, BEO or contract went.
  const appliedLink =
    item.status !== "APPLIED" || !proposal
      ? null
      : appliedBlock
        ? { label: `Applied to ${appliedBlock.proposal.venue.name}`, href: `/events/${eventId}/hotels/blocks/${appliedBlock.id}` }
        : proposal.kind === "RFP_DECLINE" && proposal.decline?.rfpId
          ? { label: "Marked declined on the RFP", href: `/events/${eventId}/hotels/rfps/${proposal.decline.rfpId}` }
          : proposal.appliedQuoteId
            ? { label: "Quote recorded", href: `/events/${eventId}/quotes/${proposal.appliedQuoteId}` }
            : proposal.appliedTo
              ? {
                  label: `Applied to ${proposal.appliedTo.label}`,
                  href:
                    proposal.appliedTo.target === "HOTEL_PROPOSAL"
                      ? `/events/${eventId}/hotels/proposals/${proposal.appliedTo.id}`
                      : proposal.appliedTo.target === "VENDOR_QUOTE"
                        ? `/events/${eventId}/quotes/${proposal.appliedTo.id}`
                        : `/events/${eventId}/catering-orders/${proposal.appliedTo.id}`,
                }
              : null;

  const release = async () => {
    "use server";
    await releaseInboundEmail(itemId, eventId);
  };
  const dismiss = async () => {
    "use server";
    await dismissInboundEmail(itemId, eventId);
  };
  const restore = async () => {
    "use server";
    await restoreInboundEmail(itemId, eventId);
  };
  const move = async (toEventId: string) => {
    "use server";
    await routeInboundEmail(itemId, eventId, toEventId);
  };
  const reparse = async () => {
    "use server";
    await reparseInboundEmail(itemId, eventId);
  };
  const applyGuests = async (
    blockId: string,
    method: Parameters<typeof applyInboundGuests>[3],
    fileName: string | null,
    guests: Parameters<typeof applyInboundGuests>[5],
  ) => {
    "use server";
    return applyInboundGuests(itemId, eventId, blockId, method, fileName, guests);
  };
  const applyOffer = async (formData: FormData) => {
    "use server";
    await applyInboundOffer(itemId, eventId, offerIndex, formData);
  };
  const applyRevision = async (proposalId: string, formData: FormData) => {
    "use server";
    await applyInboundRevision(itemId, eventId, offerIndex, proposalId, formData);
  };
  const skipOffer = async () => {
    "use server";
    await skipInboundOffer(itemId, eventId, offerIndex);
  };
  const applyDecline = async (rfpId: string, venueId: string, reason: string | null) => {
    "use server";
    return applyInboundDecline(itemId, eventId, rfpId, venueId, reason);
  };
  const applyQuote = async (formData: FormData) => {
    "use server";
    await applyInboundQuote(itemId, eventId, formData);
  };
  const applyBeo = async (orderId: string, keys: string[]) => {
    "use server";
    return applyInboundBeo(itemId, eventId, orderId, keys);
  };
  const applyContract = async (target: ContractTarget, targetId: string, note: string | null) => {
    "use server";
    return applyInboundContract(itemId, eventId, target, targetId, note);
  };
  const itemHref = `/events/${eventId}/inbox/${itemId}`;
  const applyCounts = async (blockId: string, counts: Parameters<typeof applyInboundCounts>[3]) => {
    "use server";
    return applyInboundCounts(itemId, eventId, blockId, counts);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Inbox", href: `/events/${eventId}/inbox` },
          { label: item.subject || "(no subject)" },
        ]}
        title={item.subject || "(no subject)"}
        actions={
          <InboxItemActions
            status={item.status}
            routed
            destinations={destinations}
            release={release}
            dismiss={dismiss}
            restore={restore}
            move={move}
            reparse={parsing ? reparse : undefined}
          />
        }
      />
      <div className="space-y-4 mb-6">
        <InboxProposalPanel
          status={item.status}
          proposal={proposal}
          error={item.error}
          model={item.model}
          parsing={parsing}
          diagnostics={diagnostics}
          appliedProposals={appliedProposals}
          appliedLink={appliedLink}
        />
        {kind === "RFP_PROPOSAL" && <InboxOfferTabs offers={offers} active={offerIndex} itemHref={itemHref} />}
        {savedProposal && <InboxSavedOffer proposal={savedProposal} href={`/events/${eventId}/hotels/proposals/${savedProposal.id}`} />}
        {kind === "RFP_PROPOSAL" && offers.length > 1 && shownOffer && shownOffer.state !== "OPEN" && !savedProposal && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {shownOffer.state === "SKIPPED" ? (
              "Skipped"
            ) : shownOffer.state === "SAVING" ? (
              "Saving…"
            ) : shownOffer.proposalId ? (
              <Link href={`/events/${eventId}/hotels/proposals/${shownOffer.proposalId}`} className="text-blue-600 dark:text-blue-400 underline">
                {shownOffer.name} proposal
              </Link>
            ) : (
              "Saved"
            )}
          </p>
        )}
        {offer && (
          <InboxOfferForm
            key={offerIndex}
            skip={offers.length > 1 ? skipOffer : undefined}
            choices={offer.choices}
            draft={offer.draft}
            rfpChoices={offer.rfpChoices}
            rfpChoice={offer.rfpChoice}
            offeredConcessions={offer.offeredConcessions}
            revisions={offer.revisions}
            newHotel={offer.newHotel}
            canAddHotel={canAddVenue}
            attachments={offer.attachments}
            create={applyOffer}
            revise={applyRevision}
            cancelHref={itemHref}
          />
        )}
        {decline && <InboxDeclineReview review={decline} itemHref={itemHref} apply={applyDecline} />}
        {quote && <InboxQuoteReview review={quote} apply={applyQuote} cancelHref={itemHref} />}
        {beo && <InboxBeoReview review={beo} apply={applyBeo} cancelHref={itemHref} />}
        {contract && <InboxContractReview review={contract} apply={applyContract} cancelHref={itemHref} />}
        {review && (
          <InboxReview
            review={review}
            itemHref={itemHref}
            applyGuests={applyGuests}
            applyCounts={applyCounts}
          />
        )}
      </div>
      <InboxItemView
        item={item}
        timezone={event.timezone}
        diagnostics={diagnostics}
        renderFileAction={(f) => {
          const file = async () => {
            "use server";
            await fileInboundAttachment(f.id, itemId, eventId);
          };
          return <FileAttachmentButton filed={item.filedStoredNames.includes(f.storedName)} file={file} />;
        }}
      />
    </>
  );
}
