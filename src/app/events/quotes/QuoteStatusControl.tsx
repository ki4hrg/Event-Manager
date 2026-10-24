"use client";

import { useState, useTransition } from "react";
import type { PermissionResource, QuoteStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

// Decline or reopen a quote; on an accepted one, withdraw the award, with an
// inline choice to take the vendor off the RFP's orders too (VENDORS write).
export function QuoteStatusControl({
  status,
  answersRfp,
  action,
  resource,
}: {
  status: QuoteStatus;
  answersRfp: boolean;
  action: (status: "RECEIVED" | "DECLINED", removeFromOrders: boolean) => Promise<void>;
  resource: PermissionResource;
}) {
  const canWrite = useCanWrite(resource);
  const canAssign = useCanWrite("VENDORS");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  const run = (next: "RECEIVED" | "DECLINED", removeFromOrders = false) => startTransition(() => action(next, removeFromOrders));

  if (status === "RECEIVED") {
    return (
      <button type="button" disabled={pending} onClick={() => run("DECLINED")} className={`${btnSecondary} disabled:opacity-50`}>
        {pending ? "Declining..." : "Decline"}
      </button>
    );
  }
  if (status === "DECLINED") {
    return (
      <button type="button" disabled={pending} onClick={() => run("RECEIVED")} className={`${btnSecondary} disabled:opacity-50`}>
        {pending ? "Reopening..." : "Reopen"}
      </button>
    );
  }
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={btnSecondary}>
        Withdraw award
      </button>
    );
  }
  const offerRemove = answersRfp && canAssign;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      {offerRemove ? "Also remove the vendor from the RFP's orders?" : "Withdraw the award?"}
      {offerRemove && (
        <button type="button" disabled={pending} onClick={() => run("RECEIVED", true)} className={`${btnPrimary} disabled:opacity-50`}>
          Withdraw and remove
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => run("RECEIVED")} className={`${offerRemove ? btnSecondary : btnPrimary} disabled:opacity-50`}>
        {pending ? "Withdrawing..." : offerRemove ? "Withdraw only" : "Withdraw"}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={btnSecondary}>
        Cancel
      </button>
    </span>
  );
}
