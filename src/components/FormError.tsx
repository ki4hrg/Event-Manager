"use client";

import { type FormEvent, useCallback, useRef, useState } from "react";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

// Runs a form's Server Action and keeps the refusal to show (#252): a
// `{ error }` from withUserErrors shows its sentence, a throw shows
// `fallback`. `run` resolves true when the action went through, so the
// caller closes its editor only then. A form that closes or navigates on
// success pairs with `onReset={keepFormValues}`; one that stays on screen
// uses `onReset={keepOnRefusal}`, so a refusal keeps what was typed but a
// save lets React reset the fields to the values the server stored.
export function useActionError(fallback = "Couldn't save. Try again.") {
  const [error, setError] = useState<string | null>(null);
  const refused = useRef(false);
  const run = useCallback(
    async (action: () => Promise<void | UserError>): Promise<boolean> => {
      setError(null);
      refused.current = false;
      try {
        const result = await action();
        if (isUserError(result)) {
          refused.current = true;
          setError(result.error);
          return false;
        }
        return true;
      } catch (e) {
        // Rethrows a redirect (a create or save that navigates): not a refusal.
        const message = actionErrorMessage(e, fallback);
        refused.current = true;
        setError(message);
        return false;
      }
    },
    [fallback],
  );
  const keepOnRefusal = useCallback((e: FormEvent<HTMLFormElement>) => {
    if (refused.current) e.preventDefault();
  }, []);
  return { error, setError, run, keepOnRefusal };
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
