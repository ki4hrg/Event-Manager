"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { isUserError, type UserError } from "@/lib/userErrors";

// Accept a whole quote: inline confirm, since it puts the vendor on the event
// and on the orders of the RFP lines it wins (which needs VENDORS write too).
// It wins the lines still open (openLines; null when the quote prices no RFP
// lines). Work can be split, so declining the RFP's other open quotes is
// offered, not forced; single lines are awarded from the comparison.
export function AwardQuoteButton({
  action,
  resource,
  otherOpen,
  openLines,
}: {
  action: (declineOthers: boolean) => Promise<UserError | void>;
  resource: PermissionResource;
  otherOpen: number;
  openLines: number | null;
}) {
  const canWrite = useCanWrite(resource);
  const canAssign = useCanWrite("VENDORS");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canWrite || !canAssign || openLines === 0) return null;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={btnPrimary}>
        Accept quote
      </button>
    );
  }
  const accept = (declineOthers: boolean) =>
    startTransition(async () => {
      const result = await action(declineOthers);
      if (isUserError(result)) setError(result.error);
    });
  const lines = openLines == null ? "Add the vendor to the event" : `Award the ${openLines} open line${openLines === 1 ? "" : "s"} and add the vendor to their orders`;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      {otherOpen > 0 ? `${lines}. Decline the ${otherOpen} other open quote${otherOpen === 1 ? "" : "s"} and close the RFP?` : `${lines}?`}
      {otherOpen > 0 && (
        <button type="button" disabled={pending} onClick={() => accept(true)} className={`${btnPrimary} disabled:opacity-50`}>
          {pending ? "Accepting..." : "Accept and decline others"}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => accept(false)}
        className={`${otherOpen > 0 ? btnSecondary : btnPrimary} disabled:opacity-50`}
      >
        {otherOpen > 0 ? "Accept only this" : pending ? "Accepting..." : "Accept"}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={btnSecondary}>
        Cancel
      </button>
      {error && <span className="w-full text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
