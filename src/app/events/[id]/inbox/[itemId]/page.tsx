import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import {
  applyInboundCounts,
  applyInboundGuests,
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
import { hasPermission } from "@/lib/permissions";
import { canSeeDiagnostics } from "@/lib/tenant";
import { isParsingConfigured, type InboundProposal } from "@/lib/inboundParse";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inbox item" };

export default async function EventInboxItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: eventId, itemId } = await params;
  const [event, item, canWrite, diagnostics] = await Promise.all([
    getEvent(eventId),
    getInboxItem(itemId, eventId),
    hasPermission("HOTELS", "WRITE", eventId),
    canSeeDiagnostics(),
  ]);
  if (!event || !item) notFound();
  const proposal = item.proposal as InboundProposal | null;
  const parsing = isParsingConfigured();
  const [destinations, review] = await Promise.all([
    canWrite ? getInboxDestinationEvents(eventId) : [],
    canWrite && item.status === "PARSED" ? getInboxReview(itemId, eventId) : null,
  ]);
  const appliedTo =
    item.status === "APPLIED" && proposal?.blockId
      ? ((await prisma.hotelBlock.findFirst({
          where: { id: proposal.blockId, proposal: { eventId } },
          select: { proposal: { select: { venue: { select: { name: true } } } } },
        }))?.proposal.venue.name ?? null)
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
    await applyInboundGuests(itemId, eventId, blockId, method, fileName, guests);
  };
  const applyCounts = async (blockId: string, counts: Parameters<typeof applyInboundCounts>[3]) => {
    "use server";
    await applyInboundCounts(itemId, eventId, blockId, counts);
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
          appliedTo={appliedTo}
        />
        {review && (
          <InboxReview
            review={review}
            itemHref={`/events/${eventId}/inbox/${itemId}`}
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
