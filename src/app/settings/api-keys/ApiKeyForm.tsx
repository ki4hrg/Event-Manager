"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { mintApiKey } from "./actions";

type User = { id: string; name: string | null; email: string };

type RevealedKey = {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string;
};

export function ApiKeyForm({ users }: { users: User[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await mintApiKey(formData);
        setRevealed({
          id: result.id,
          name: result.name,
          keyPrefix: result.keyPrefix,
          fullKey: result.fullKey,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create key");
      }
    });
  }

  if (revealed) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded p-4 mb-6">
        <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
          Key created — copy it now
        </h3>
        <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
          This is the only time the full key will be shown. Store it somewhere safe
          before navigating away — we can't recover it later.
        </p>
        <pre className="mt-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 text-sm font-mono text-gray-900 dark:text-gray-100 break-all whitespace-pre-wrap">
          {revealed.fullKey}
        </pre>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(revealed.fullKey);
            }}
            className={btnPrimary}
          >
            Copy to clipboard
          </button>
          <button type="button" onClick={() => setRevealed(null)} className={btnSecondary}>
            Done — I&apos;ve copied it
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={onSubmit}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-4 mb-6"
    >
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
        Mint a new API key
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            User
          </span>
          <select
            name="userId"
            required
            defaultValue=""
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="" disabled>
              Select a user…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ? `${u.name} (${u.email})` : u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Key name
          </span>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. claude-desktop-laptop"
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Creating…" : "Create key"}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The key inherits the selected user's role and event assignments.
        </p>
      </div>
    </form>
  );
}
