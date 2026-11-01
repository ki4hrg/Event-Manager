"use client";

import { useCallback, useState } from "react";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

// Runs a form's Server Action and keeps the refusal to show (#252): a
// `{ error }` from withUserErrors shows its sentence, a throw shows
// `fallback`. `run` resolves true when the action went through, so the
// caller closes its editor only then. Pair the form with
// `onReset={keepFormValues}` so a refused form keeps what was typed.
export function useActionError(fallback = "Couldn't save. Try again.") {
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: () => Promise<void | UserError>): Promise<boolean> => {
      setError(null);
      try {
        const result = await action();
        if (isUserError(result)) {
          setError(result.error);
          return false;
        }
        return true;
      } catch (e) {
        setError(actionErrorMessage(e, fallback));
        return false;
      }
    },
    [fallback],
  );
  return { error, setError, run };
}

export function FormError({ error, className = "" }: { error: string | null; className?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={`p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400 text-sm ${className}`}
    >
      {error}
    </p>
  );
}
