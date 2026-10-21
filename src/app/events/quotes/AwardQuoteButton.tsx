"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

// Accept a quote: inline confirm, since it closes the RFP and puts the
// vendor on the event and its orders.
export function AwardQuoteButton({ action, resource, onRfp }: { action: () => Promise<void>; resource: PermissionResource; onRfp: boolean }) {
  const canWrite = useCanWrite(resource);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={btnPrimary}>
        Accept quote
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      {onRfp ? "Close the RFP and add the vendor to the event and its orders?" : "Add the vendor to the event?"}
      <button type="button" disabled={pending} onClick={() => startTransition(action)} className={`${btnPrimary} disabled:opacity-50`}>
        {pending ? "Accepting..." : "Accept"}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={btnSecondary}>
        Cancel
      </button>
    </span>
  );
}
