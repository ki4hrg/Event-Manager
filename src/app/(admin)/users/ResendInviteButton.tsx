"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type UserError, actionErrorMessage, isUserError } from "@/lib/userErrors";

type Props = {
  action: () => Promise<void | UserError>;
};

export function ResendInviteButton({ action }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<"sent" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setConfirmation(null);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (isUserError(result)) {
          setConfirmation("error");
          setErrorMessage(result.error);
          return;
        }
        setConfirmation("sent");
        router.refresh();
        setTimeout(() => setConfirmation(null), 3000);
      } catch (e) {
        setConfirmation("error");
        setErrorMessage(actionErrorMessage(e, "Failed to send email"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="self-start px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send password reset / setup link"}
      </button>
      {confirmation === "sent" && (
        <span className="text-xs text-green-700 dark:text-green-400">Email sent.</span>
      )}
      {confirmation === "error" && (
        <span className="text-xs text-red-700 dark:text-red-400">
          {errorMessage || "Failed to send email."}
        </span>
      )}
    </div>
  );
}
