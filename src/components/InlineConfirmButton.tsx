"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanDo } from "@/components/PermissionsProvider";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

type InlineConfirmButtonProps = {
  // A refusal (returned { error } or a throw) shows beside the buttons (#252).
  onConfirm: () => Promise<void | UserError> | void;
  label?: string;
  confirmLabel?: string;
  // Consequence shown beside Confirm ("Rooms will become ungrouped.").
  prompt?: string;
  // Required — see the notes in DeleteButton.
  resource: PermissionResource;
  requiredLevel?: "WRITE" | "DELETE";
  // Trigger styling; defaults to a red text link for row actions.
  className?: string;
  disabled?: boolean;
  // Shown when the action throws instead of returning { error }.
  fallback?: string;
};

// Callback flavour of InlineDeleteButton for deletes/unlinks that aren't
// FormData actions (row callbacks, bulk "Delete selected").
export function InlineConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Confirm",
  prompt,
  resource,
  requiredLevel = "DELETE",
  className = "text-red-600 dark:text-red-400 hover:underline text-sm",
  disabled = false,
  fallback = "Couldn't do that. Try again.",
}: InlineConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const allowed = useCanDo(resource, requiredLevel);

  if (!allowed) return null;

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm">
        {prompt && <span className="text-gray-600 dark:text-gray-400">{prompt}</span>}
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const result = await onConfirm();
                if (isUserError(result)) return setError(result.error);
                setConfirming(false);
              } catch (e) {
                setError(actionErrorMessage(e, fallback));
              }
            })
          }
          className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
        >
          {isPending ? "Working..." : confirmLabel}
        </button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            setConfirming(false);
          }}
          className="text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
        {error && (
          <span role="alert" className="basis-full text-red-700 dark:text-red-400">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className={className}
    >
      {label}
    </button>
  );
}
