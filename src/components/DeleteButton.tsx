"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanDo } from "@/components/PermissionsProvider";
import { btnDanger, btnDangerSm } from "@/lib/buttonStyles";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

type DeleteButtonProps = {
  // A refusal returned as { error } (withUserErrors) is shown beside the button.
  action: () => Promise<void | UserError>;
  label?: string;
  // Required rather than optional so a new call site can't silently keep
  // showing Delete to a read-only user. Outside an event layout the hook
  // returns true and the button behaves as it always did.
  resource: PermissionResource;
  // Most deletes gate on DELETE, but a few actions that read as "remove" are
  // WRITE on the server (unassigning event staff, say). Match the action's own
  // gate or the button hides from users the server would have allowed.
  requiredLevel?: "WRITE" | "DELETE";
};

export function DeleteButton({
  action,
  label = "Delete",
  resource,
  requiredLevel = "DELETE",
}: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pending until the action settles, so a second click can't run it twice.
  const [pending, startTransition] = useTransition();
  const allowed = useCanDo(resource, requiredLevel);

  if (!allowed) return null;

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Are you sure?</span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            startTransition(async () => {
              try {
                const result = await action();
                setError(isUserError(result) ? result.error : null);
              } catch (e) {
                setError(actionErrorMessage(e, "Couldn't delete that. Reload the page and try again."));
              }
            });
          }}
          className={btnDangerSm}
        >
          {label}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className={`${btnDanger} disabled:opacity-50`}
      >
        {label}
      </button>
      {error && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
