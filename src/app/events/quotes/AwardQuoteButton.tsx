"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

// Accept a quote: inline confirm, since it puts the vendor on the event and
// its orders (which needs VENDORS write too). Work can be split across
// vendors, so declining the RFP's other open quotes is offered, not forced.
export function AwardQuoteButton({
  action,
  resource,
  otherOpen,
}: {
  action: (declineOthers: boolean) => Promise<void>;
  resource: PermissionResource;
  otherOpen: number;
}) {
  const canWrite = useCanWrite(resource);
  const canAssign = useCanWrite("VENDORS");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!canWrite || !canAssign) return null;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={btnPrimary}>
        Accept quote
      </button>
    );
  }
  const accept = (declineOthers: boolean) => startTransition(() => action(declineOthers));
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      {otherOpen > 0
        ? `Add the vendor to the event and its orders. Decline the ${otherOpen} other open quote${otherOpen === 1 ? "" : "s"} and close the RFP?`
        : "Add the vendor to the event and its orders?"}
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
    </span>
  );
}
