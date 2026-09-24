"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { revokeShareLinkGroup } from "@/app/events/share-link-groups/actions";
import { useCanWrite } from "@/components/PermissionsProvider";

type Group = {
  id: string;
  token: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
  createdBy: { name: string | null; email: string | null } | null;
  _count: { items: number };
};

type Props = {
  eventId: string;
  groups: Group[];
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function status(group: Group): { label: string; cls: string } {
  if (group.revokedAt) return { label: "Revoked", cls: "text-red-600 dark:text-red-400" };
  if (group.expiresAt && new Date(group.expiresAt) < new Date())
    return { label: "Expired", cls: "text-amber-600 dark:text-amber-400" };
  return { label: "Active", cls: "text-green-600 dark:text-green-400" };
}

function shareUrl(token: string): string {
  return `${window.location.origin}/share/group/${token}`;
}

export function ShareLinkGroupsTable({ eventId, groups }: Props) {
  const canWrite = useCanWrite("SHARE_LINKS");
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (groups.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No dashboards yet.
        {canWrite && (
          <>
            {" "}
            <Link
              href={`/events/${eventId}/share-links/dashboards/new`}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Create one
            </Link>{" "}
            to bundle multiple reports under a single link.
          </>
        )}
      </p>
    );
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(shareUrl(token)).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleRevoke(id: string) {
    setRevoking(id);
    startTransition(async () => {
      await revokeShareLinkGroup(id);
      setRevoking(null);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Label</th>
            <th className="py-2 pr-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Reports</th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Created by</th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Created</th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Expires</th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Last accessed</th>
            <th className="py-2 pr-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Views</th>
            <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
            <th className="py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {groups.map((g) => {
            const s = status(g);
            const active = !g.revokedAt && !(g.expiresAt && new Date(g.expiresAt) < new Date());
            return (
              <tr key={g.id}>
                <td className="py-2 pr-4 text-gray-900 dark:text-white">
                  <Link
                    href={`/events/${eventId}/share-links/dashboards/${g.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {g.label || <span className="italic">Untitled dashboard</span>}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400">
                  {g._count.items}
                </td>
                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                  {g.createdBy?.name ?? g.createdBy?.email ?? "—"}
                </td>
                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {formatDate(g.createdAt)}
                </td>
                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {formatDate(g.expiresAt)}
                </td>
                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {formatDate(g.lastAccessedAt)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400">
                  {g.accessCount}
                </td>
                <td className={`py-2 pr-4 text-xs ${s.cls}`}>{s.label}</td>
                <td className="py-2 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    {active && (
                      <button
                        onClick={() => handleCopy(g.token)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {copied === g.token ? "Copied!" : "Copy URL"}
                      </button>
                    )}
                    {canWrite && active && (
                      <button
                        onClick={() => handleRevoke(g.id)}
                        disabled={revoking === g.id}
                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        {revoking === g.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
