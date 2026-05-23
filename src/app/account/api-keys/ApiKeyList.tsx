"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeApiKey } from "./actions";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString();
}

export function ApiKeyList({ keys }: { keys: ApiKeyRow[] }) {
  if (keys.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        No API keys yet. Create one above to use the MCP connector from Claude
        Desktop or other clients.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Name</th>
            <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Prefix</th>
            <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Created</th>
            <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Last used</th>
            <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {keys.map((k) => (
            <ApiKeyRow key={k.id} row={k} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiKeyRow({ row }: { row: ApiKeyRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isRevoked = row.revokedAt != null;

  function onRevoke() {
    if (!confirm(`Revoke API key "${row.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await revokeApiKey(row.id);
      router.refresh();
    });
  }

  return (
    <tr className={isRevoked ? "opacity-60" : undefined}>
      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.name}</td>
      <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">
        {row.keyPrefix}…
      </td>
      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
        {formatDate(row.createdAt)}
      </td>
      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
        {formatDate(row.lastUsedAt)}
      </td>
      <td className="px-3 py-2">
        {isRevoked ? (
          <span className="inline-flex px-2 py-0.5 rounded text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            Revoked {formatDate(row.revokedAt)}
          </span>
        ) : (
          <span className="inline-flex px-2 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200">
            Active
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {!isRevoked ? (
          <button
            type="button"
            onClick={onRevoke}
            disabled={pending}
            className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            {pending ? "Revoking…" : "Revoke"}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
