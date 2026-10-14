"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanDo } from "@/components/PermissionsProvider";

type InlineConfirmButtonProps = {
  onConfirm: () => Promise<void> | void;
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
}: InlineConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
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
              await onConfirm();
              setConfirming(false);
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
          onClick={() => setConfirming(false)}
          className="text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
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
