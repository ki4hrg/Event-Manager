"use client";

import { useTransition } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { btnOutlinedSm } from "@/lib/buttonStyles";

type Props = {
  packingStatus: PackingStatus;
  acquisitionState: AcquisitionState;
  onFix: () => Promise<void> | void;
  disabled?: boolean;
  isPending?: boolean;
};

export function PackingProcurementWarning({
  packingStatus,
  acquisitionState,
  onFix,
  disabled,
  isPending,
}: Props) {
  const incoherent =
    (packingStatus === "IN_TRANSIT" || packingStatus === "DELIVERED") &&
    acquisitionState === "TO_PROCURE";
  const [localPending, start] = useTransition();
  const pending = isPending ?? localPending;
  if (!incoherent) return null;
  const label = packingStatus === "IN_TRANSIT" ? "in transit" : "delivered";
  return (
    <div className="inline-flex items-center gap-2 text-xs rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 px-2 py-1">
      <span>
        Marked {label} but still To Procure.
      </span>
      {!disabled && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await onFix();
            })
          }
          className={btnOutlinedSm}
        >
          Mark on hand
        </button>
      )}
    </div>
  );
}
