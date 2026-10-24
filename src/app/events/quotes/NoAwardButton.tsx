"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnDanger, btnSecondary } from "@/lib/buttonStyles";
import { isUserError, type UserError } from "@/lib/userErrors";

// Records that no vendor was awarded: inline confirm, since it declines every
// open quote and closes the RFP.
export function NoAwardButton({
  action,
  resource,
  open,
}: {
  action: () => Promise<UserError | void>;
  resource: PermissionResource;
  open: number;
}) {
  const canWrite = useCanWrite(resource);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  const run = () =>
    startTransition(async () => {
      const result = await action();
      if (isUserError(result)) setError(result.error);
    });

  return (
    <div className="space-y-2 text-sm">
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
          {open > 0 ? `Decline ${open} open quote${open === 1 ? "" : "s"} and close the RFP?` : "Close the RFP with no award?"}
          <button type="button" disabled={pending} onClick={run} className={`${btnDanger} disabled:opacity-50`}>
            {pending ? "Recording..." : "No award"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={btnSecondary}>
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-blue-600 dark:text-blue-400 hover:underline">
          No award
        </button>
      )}
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
