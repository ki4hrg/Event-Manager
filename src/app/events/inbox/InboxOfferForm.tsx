"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import {
  ProposalForm,
  type ConcessionAnswer,
  type OfferedConcession,
  type ProposalChoices,
  type ProposalTemplate,
  type ProposalValues,
  type RfpChoice,
} from "../hotels/ProposalForm";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

export type OfferRevision = {
  id: string;
  label: string;
  proposal: ProposalValues;
  draft: ProposalValues;
  concessions: ConcessionAnswer[];
  offeredConcessions: OfferedConcession[];
};

const NEW = "__new__";

export type OfferAttachment = { id: string; fileName: string; picked: boolean };

// Which of the message's files go on the proposal.
function AttachmentPick({ attachments }: { attachments: OfferAttachment[] }) {
  return (
    <fieldset className="space-y-2 min-w-0">
      <legend className="text-sm font-semibold text-gray-900 dark:text-white">Attachments</legend>
      <input type="hidden" name="attachmentPick" value="true" />
      {attachments.map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 break-all">
          <input type="checkbox" name="attachmentIds" value={a.id} defaultChecked={a.picked} />
          {a.fileName}
        </label>
      ))}
    </fieldset>
  );
}

// An emailed offer as a new proposal, or, when the hotel already has one for
// the event, as the next revision of it (the default).
export function InboxOfferForm({
  choices,
  draft,
  rfpChoices,
  rfpChoice,
  offeredConcessions,
  revisions,
  newHotel,
  canAddHotel,
  attachments,
  create,
  revise,
  skip,
  cancelHref,
}: {
  choices: ProposalChoices;
  draft: ProposalValues;
  rfpChoices: RfpChoice[];
  rfpChoice: RfpChoice | null;
  offeredConcessions: OfferedConcession[];
  revisions: OfferRevision[];
  newHotel: ComponentProps<typeof ProposalForm>["newHotel"];
  canAddHotel: boolean;
  attachments: OfferAttachment[];
  create: (formData: FormData) => Promise<void>;
  revise: (proposalId: string, formData: FormData) => Promise<void>;
  // One of several offers in a message: pass this hotel over.
  skip?: () => Promise<void>;
  cancelHref: string;
}) {
  const [target, setTarget] = useState(revisions[0]?.id ?? NEW);
  const [skipping, startSkip] = useTransition();
  const revision = revisions.find((r) => r.id === target);
  const attachmentPick = attachments.length > 0 ? <AttachmentPick attachments={attachments} /> : undefined;
  const fromRfp: ProposalTemplate | undefined = rfpChoice
    ? { rfpBlockId: rfpChoice.id, contractType: rfpChoice.contractType, guestType: rfpChoice.guestType, status: draft.status, nights: [] }
    : undefined;
  return (
    <div className="space-y-4">
      {skip && (
        <div className="flex justify-end">
          <button type="button" disabled={skipping} onClick={() =>
              startSkip(async () => {
                await skip();
              })
            } className={btnOutlinedSm}>
            {skipping ? "Skipping…" : "Skip this hotel"}
          </button>
        </div>
      )}
      {revisions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <label htmlFor="offer-target" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Apply as
          </label>
          <select id="offer-target" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
            {revisions.map((r) => (
              <option key={r.id} value={r.id}>
                Revision of {r.label}
              </option>
            ))}
            <option value={NEW}>New proposal</option>
          </select>
        </div>
      )}
      {revision ? (
        <ProposalForm
          key={revision.id}
          proposal={revision.proposal}
          draft={revision.draft}
          concessions={revision.concessions}
          offeredConcessions={revision.offeredConcessions}
          choices={choices}
          extraFields={attachmentPick}
          action={(formData) => revise(revision.id, formData)}
          cancelHref={cancelHref}
        />
      ) : (
        <ProposalForm
          key={NEW}
          choices={choices}
          draft={draft}
          rfpChoices={rfpChoices}
          fromRfp={fromRfp}
          concessions={rfpChoice?.concessions ?? []}
          offeredConcessions={offeredConcessions}
          newHotel={newHotel}
          canAddHotel={canAddHotel}
          extraFields={attachmentPick}
          action={create}
          cancelHref={cancelHref}
        />
      )}
    </div>
  );
}
