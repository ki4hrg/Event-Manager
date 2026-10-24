"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { isUserError, type UserError } from "@/lib/userErrors";

export function CopyFormLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/f/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function RevokeFormLink({ revoke }: { revoke: () => Promise<void> }) {
  const canWrite = useCanWrite("FORMS");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  if (!canWrite) return null;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-red-600 dark:text-red-400 hover:underline">
        Revoke
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await revoke();
            setConfirming(false);
            router.refresh();
          })
        }
        className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-50"
      >
        Confirm revoke
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-gray-500 dark:text-gray-400 hover:underline">
        Cancel
      </button>
    </span>
  );
}

export function DeleteFormLink({ deleteLink }: { deleteLink: () => Promise<void | UserError> }) {
  const canWrite = useCanWrite("FORMS");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (!canWrite) return null;
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-red-600 dark:text-red-400 hover:underline">
        Delete
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const result = await deleteLink();
              if (isUserError(result)) {
                setError(result.error);
                return;
              }
              setConfirming(false);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't delete the link");
            }
          })
        }
        className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-50"
      >
        Confirm delete
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-gray-500 dark:text-gray-400 hover:underline">
        Cancel
      </button>
      {error && <span className="basis-full text-red-600 dark:text-red-400 whitespace-normal">{error}</span>}
    </span>
  );
}
