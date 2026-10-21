"use client";

import { useState, type ComponentProps } from "react";
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
  create,
  revise,
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
  create: (formData: FormData) => Promise<void>;
  revise: (proposalId: string, formData: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const [target, setTarget] = useState(revisions[0]?.id ?? NEW);
  const revision = revisions.find((r) => r.id === target);
  const fromRfp: ProposalTemplate | undefined = rfpChoice
    ? { rfpBlockId: rfpChoice.id, contractType: rfpChoice.contractType, guestType: rfpChoice.guestType, status: draft.status, nights: [] }
    : undefined;
  return (
    <div className="space-y-4">
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
          action={create}
          cancelHref={cancelHref}
        />
      )}
    </div>
  );
}
