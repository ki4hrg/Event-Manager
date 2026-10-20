import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "../../../../actions";
import Link from "next/link";
import { btnSecondary } from "@/lib/buttonStyles";
import { stageOf } from "@/lib/hotels";
import { CreateBlockButton } from "../../../../hotels/CreateBlockButton";
import {
  createHotelBlock,
  deleteHotelProposal,
  getHotelProposal,
  getProposalFormChoices,
  updateHotelProposal,
} from "../../../../hotels/actions";
import { toProposalValues } from "../../../../hotels/core";
import { ProposalForm } from "../../../../hotels/ProposalForm";
import { VersionHistory } from "../../../../hotels/VersionHistory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proposal" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id: eventId, proposalId } = await params;
  const [event, proposal, choices, fileTypeOptions] = await Promise.all([
    getEvent(eventId),
    getHotelProposal(proposalId, eventId),
    getProposalFormChoices(eventId),
    getOptions("file_type"),
  ]);
  if (!event || !proposal) notFound();

  const updateAction = async (formData: FormData) => {
    "use server";
    await updateHotelProposal(proposalId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteHotelProposal(proposalId, eventId);
  };
  const createBlockAction = async () => {
    "use server";
    await createHotelBlock(proposalId, eventId);
  };
  const accepted = stageOf(proposal.status, choices.statuses) === "ACCEPTED";

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
              { label: "Hotels", href: `/events/${eventId}/hotels` },
              { label: proposal.venue.name },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">
            {proposal.venue.name}
            {proposal.revision > 1 && <span className="ml-2 text-base text-gray-500 dark:text-gray-400">rev {proposal.revision}</span>}
          </h1>
          <LastUpdated updatedAt={proposal.updatedAt} updatedBy={proposal.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {proposal.rfp && (
            <Link href={`/events/${eventId}/hotels/rfps/${proposal.rfp.id}`} className={btnSecondary}>
              RFP
            </Link>
          )}
          {proposal.block ? (
            <Link href={`/events/${eventId}/hotels/blocks/${proposal.block.id}`} className={btnSecondary}>
              Block
            </Link>
          ) : (
            accepted && <CreateBlockButton action={createBlockAction} />
          )}
          <DeleteButton action={deleteAction} resource="HOTELS" label="Delete Proposal" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 min-w-0">
          <ProposalForm
            key={proposal.updatedAt.toISOString()}
            proposal={toProposalValues(proposal)}
            choices={choices}
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
