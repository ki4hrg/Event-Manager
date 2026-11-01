"use client";

import {
  createContext,
  type FormEvent,
  type FormEventHandler,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { keepFormValues } from "@/lib/keepFormValues";
import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";

// Runs a form's Server Action for ActionForm (#252): a `{ error }` from
// withUserErrors shows its sentence, a throw shows `fallback` (a redirect or
// notFound is rethrown by actionErrorMessage). `run` resolves true when the
// action went through. `keepOnRefusal` cancels React's post-action reset only
// after a refusal.
function useActionError(fallback = "Couldn't save. Try again.") {
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

function FormError({ error, className = "" }: { error: string | null; className?: string }) {
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

const ActionFormErrorContext = createContext<string | null>(null);

// A <form> whose Server Action can refuse (#252). It runs `action` through
// useActionError and calls `onDone` only when it went through, so an editor
// closes on success and stays open, with what was typed, on a refusal. The
// error lives in this form: a form that closes takes its error with it.
// Put <ActionFormError /> where the message belongs (above the buttons).
// `keepValues`: "onRefusal" (default) keeps what was typed only after a
// refusal, so a form that stays on screen shows what the server stored after
// a save; "always" for a form that resets itself otherwise (React 18 behaviour).
export function ActionForm({
  action,
  onDone,
  keepValues = "onRefusal",
  fallback,
  onSubmit,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void | UserError>;
  onDone?: () => void;
  keepValues?: "always" | "onRefusal";
  fallback?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
  children: ReactNode;
}) {
  const { error, run, keepOnRefusal } = useActionError(fallback);
  return (
    <form
      action={async (formData) => {
        let saved: boolean;
        try {
          saved = await run(() => action(formData));
        } catch (navigation) {
          // run only lets Next's redirect / notFound through: the action went
          // through and navigated (often to this same page with ?success=,
          // where this component keeps its state), so close the editor too.
          onDone?.();
          throw navigation;
        }
        if (saved) onDone?.();
      }}
      onReset={keepValues === "always" ? keepFormValues : keepOnRefusal}
      onSubmit={onSubmit}
      className={className}
    >
      <ActionFormErrorContext.Provider value={error}>{children}</ActionFormErrorContext.Provider>
    </form>
  );
}

// The enclosing ActionForm's refusal, if any.
export function ActionFormError({ className }: { className?: string }) {
  return <FormError error={useContext(ActionFormErrorContext)} className={className} />;
}
