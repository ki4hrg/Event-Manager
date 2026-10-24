"use client";

import { useState, useTransition } from "react";
import { isUserError, type UserError } from "@/lib/userErrors";

type Props = {
  action: (formData: FormData) => Promise<void | UserError>;
  defaultTo?: string;
  disabled?: boolean;
};

export function SendTestEmailForm({ action, defaultTo, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (isUserError(result)) {
          setStatus({ kind: "error", message: result.error });
          return;
        }
        setStatus({ kind: "ok", message: "Test email sent." });
      } catch (e) {
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "Send failed.",
        });
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="to" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Recipient
        </label>
        <input
          id="to"
          name="to"
          type="email"
          required
          defaultValue={defaultTo}
          disabled={disabled}
          className="mt-1 block w-full max-w-md border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || disabled}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send test email"}
        </button>
        {status && (
          <span
            className={`text-sm break-words min-w-0 ${
              status.kind === "ok"
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}
