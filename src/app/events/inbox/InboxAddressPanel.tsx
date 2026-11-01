"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnOutlinedSm, btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { isUserError, type UserError, actionErrorMessage } from "@/lib/userErrors";

// The event's inbox address, `<org>.<name>@<domain>`. Only the name part is
// editable; the org part is the organization's slug.
export function InboxAddressPanel({
  domain,
  tenantSlug,
  inboxSlug,
  suggestion,
  save,
}: {
  domain: string | null;
  tenantSlug: string;
  inboxSlug: string | null;
  suggestion: string | null;
  save: (slug: string | null) => Promise<void | UserError>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(inboxSlug ?? suggestion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!domain) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Inbound email isn&apos;t configured on this server.</p>;
  }

  const address = inboxSlug ? `${tenantSlug}.${inboxSlug}@${domain}` : null;
  const submit = (slug: string | null) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await save(slug);
        if (isUserError(result)) {
          setError(result.error);
          return;
        }
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(actionErrorMessage(e, "Couldn't save"));
      }
    });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-3">
      {editing || !address ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(value.trim() || null);
          }}
        >
          <div className="flex flex-wrap items-center gap-1 font-mono text-sm text-gray-700 dark:text-gray-300">
            <span>{tenantSlug}.</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Inbox name"
              className="min-w-0 w-48 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
            <span>@{domain}</span>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending || !value.trim()} className={`${btnPrimary} disabled:opacity-50`}>
              {pending ? "Saving..." : address ? "Save" : "Create inbox"}
            </button>
            {address && (
              <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm text-gray-900 dark:text-white break-all">{address}</code>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(address).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
              className={btnOutlinedSm}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setValue(inboxSlug ?? "");
                setEditing(true);
              }}
              className={btnOutlinedSm}
            >
              Change
            </button>
            <button type="button" disabled={pending} onClick={() => submit(null)} className={`${btnOutlinedSm} disabled:opacity-50`}>
              Turn off
            </button>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}
