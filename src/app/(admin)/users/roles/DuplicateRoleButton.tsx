"use client";

import { useState, useTransition } from "react";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

type Props = {
  duplicate: () => Promise<void | UserError>;
};

export function DuplicateRoleButton({ duplicate }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const result = await duplicate();
              if (isUserError(result)) setError(result.error);
            } catch (e) {
              setError(actionErrorMessage(e, "Couldn't duplicate the role"));
            }
          })
        }
        className="text-blue-600 dark:text-blue-400 hover:underline text-sm disabled:opacity-50"
      >
        {isPending ? "Duplicating..." : "Duplicate"}
      </button>
      {error && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
