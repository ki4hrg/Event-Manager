import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { rfpHref } from "@/lib/rfp/kinds";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getOptions } from "@/app/(admin)/settings/actions";
import { getEvent } from "@/app/events/event";
import Link from "next/link";
import { btnSecondary } from "@/lib/buttonStyles";
import { stageOf } from "@/lib/hotels";
import { meetingRequests, rfpMealTypes } from "@/lib/rfp/proposalSpace";
import { hasPermission } from "@/lib/permissions";
import { addVenueAmenity } from "@/app/venues/actions";
import { AddBlockForm } from "../../../../hotels/AddBlockForm";
import {
  createHotelBlock,
  deleteHotelProposal,
  getHotelProposal,
  getProposalFormChoices,
  getProposalRfpChoices,
  updateHotelProposal,
} from "../../../../hotels/actions";
import { toProposalValues } from "../../../../hotels/core";
import { ProposalForm } from "../../../../hotels/ProposalForm";
import { VersionHistory } from "../../../../hotels/VersionHistory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proposal" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id: eventId, proposalId } = await params;
  const [event, proposal, choices, fileTypeOptions, canEditHotel, canViewHotel] = await Promise.all([
    getEvent(eventId),
    getHotelProposal(proposalId, eventId),
    getProposalFormChoices(eventId),
    getOptions("file_type"),
    hasPermission("VENUES", "WRITE"),
    hasPermission("VENUES", "VIEW"),
  ]);
  if (!event || !proposal) notFound();
  const rfpChoices = await getProposalRfpChoices(eventId, { rfpId: proposal.rfpId, answers: proposal.concessions });
  // Linked to an RFP but not one of its blocks: its first (or the RFP itself,
  // when it has none).
  const rfpBlockId = proposal.rfpBlockId ?? rfpChoices.find((c) => c.rfpId === proposal.rfpId)?.id ?? null;

  const updateAction = async (formData: FormData) => {
    "use server";
    await updateHotelProposal(proposalId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteHotelProposal(proposalId, eventId);
  };
  const createBlockAction = async (formData: FormData) => {
    "use server";
    await createHotelBlock(proposalId, eventId, formData);
  };
  const addAmenityAction = async (label: string) => {
    "use server";
    await addVenueAmenity(proposal.venueId, label);
  };
  const accepted = stageOf(proposal.status, choices.statuses) === "ACCEPTED";
  // A new block is for the proposal's guest type until one has it, then the
  // first guest type no block has.
  const taken = new Set(proposal.blocks.map((b) => b.guestType));
  const nextGuestType = !taken.has(proposal.guestType) ? proposal.guestType : (choices.guestTypes.find((g) => !taken.has(g)) ?? proposal.guestType);

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Hotels", href: `/events/${eventId}/hotels` },
          { label: "Proposals", href: `/events/${eventId}/hotels#proposals` },
          { label: proposal.venue.name },
        ]}
        title={`Proposal · ${proposal.venue.name}`}
        meta={
          <div className="space-y-1">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {[proposal.status, `rev ${proposal.revision}`, proposal.rfp?.title].filter(Boolean).join(" · ")}
            </p>
            <LastUpdated updatedAt={proposal.updatedAt} updatedBy={proposal.updatedBy} timezone={event.timezone} />
          </div>
        }
        actions={
          <>
            {canViewHotel && (
              <Link href={`/venues/${proposal.venueId}`} className={btnSecondary}>
                View hotel
              </Link>
            )}
            {proposal.rfp && (
              <Link href={rfpHref(eventId, "HOTEL", proposal.rfp.id)} className={btnSecondary}>
                View RFP
              </Link>
            )}
            {proposal.blocks.map((b, i) => (
              <Link key={b.id} href={`/events/${eventId}/hotels/blocks/${b.id}`} className={btnSecondary}>
                {proposal.blocks.length === 1 ? "View block" : `Block · ${b.guestType ?? i + 1}`}
              </Link>
            ))}
            {accepted && <AddBlockForm action={createBlockAction} guestTypes={choices.guestTypes} defaultGuestType={nextGuestType} />}
            <DeleteButton action={deleteAction} resource="HOTELS" label="Delete Proposal" />
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 min-w-0">
          {/* Autosaves: not keyed on updatedAt, or each save would remount it. */}
          <ProposalForm
            proposal={toProposalValues(proposal)}
            concessions={(proposal.rfp?.concessions ?? []).map((c) => {
              const answer = proposal.concessions.find((a) => a.concessionId === c.id);
              return { id: c.id, label: c.label, value: c.value, required: c.required, offered: answer?.offered ?? null, met: answer?.met ?? null };
            })}
            offeredConcessions={proposal.concessions.flatMap((c) => (c.concessionId ? [] : [{ label: c.label ?? "", offered: c.offered }]))}
            spaceRequests={meetingRequests(proposal.rfp?.spaceRequests ?? [])}
            mealTypes={rfpMealTypes(proposal.rfp?.spaceRequests ?? [])}
            choices={choices}
            rfpChoices={rfpChoices.length ? rfpChoices : undefined}
            rfpBlockId={rfpBlockId}
            addAmenityToHotel={canEditHotel ? addAmenityAction : undefined}
            action={updateAction}
            cancelHref={`/events/${eventId}/hotels`}
          />
        </div>
        <div className="space-y-6 min-w-0">
          <FileUploadPanel
            entityType="hotelProposal"
            entityId={proposalId}
            files={proposal.files}
            fileTypeOptions={fileTypeOptions}
            revalidateTarget={`/events/${eventId}/hotels/proposals/${proposalId}`}
          />
          <VersionHistory versions={proposal.versions} timezone={event.timezone} />
        </div>
      </div>
    </>
  );
}
