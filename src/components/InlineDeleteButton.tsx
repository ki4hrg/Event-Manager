"use client";

import { useState, useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanDo } from "@/components/PermissionsProvider";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

type InlineDeleteButtonProps = {
  // A refusal (returned { error } or a throw) shows beside the buttons (#252).
  action: (formData: FormData) => Promise<void | UserError>;
  hiddenInputs: Record<string, string>;
  label?: string;
  // Required — see the notes in DeleteButton.
  resource: PermissionResource;
  requiredLevel?: "WRITE" | "DELETE";
};

export function InlineDeleteButton({
  action,
  hiddenInputs,
  label = "Delete",
  resource,
  requiredLevel = "DELETE",
}: InlineDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const allowed = useCanDo(resource, requiredLevel);

  if (!allowed) return null;

  function handleConfirm() {
    const formData = new FormData();
    for (const [name, value] of Object.entries(hiddenInputs)) {
      formData.append(name, value);
    }
    startTransition(async () => {
      setError(null);
      try {
        const result = await action(formData);
        if (isUserError(result)) return setError(result.error);
        setConfirming(false);
      } catch (e) {
        setError(actionErrorMessage(e, "Couldn't delete. Try again."));
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          disabled={isPending}
          onClick={handleConfirm}
          className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
        >
          {isPending ? "Working..." : "Confirm"}
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
      onClick={() => setConfirming(true)}
      className="text-red-600 dark:text-red-400 hover:underline text-sm"
    >
      {label}
    </button>
  );
}
