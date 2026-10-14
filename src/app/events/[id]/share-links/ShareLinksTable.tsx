"use client";

import { useState } from "react";
import { revokeShareLink } from "@/app/events/share-links/actions";
import { useRouter } from "next/navigation";
import { SHARE_REPORT_LABELS } from "@/lib/shareLinks";
import { useCanWrite } from "@/components/PermissionsProvider";

type Link = {
  id: string;
  token: string;
  reportType: string;
  label: string | null;
  filtersLocked: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
  createdBy: { name: string | null; email: string | null } | null;
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function linkStatus(link: Link): { label: string; cls: string } {
  if (link.revokedAt) return { label: "Revoked", cls: "text-red-600 dark:text-red-400" };
  if (link.expiresAt && new Date(link.expiresAt) < new Date())
    return { label: "Expired", cls: "text-amber-600 dark:text-amber-400" };
  return { label: "Active", cls: "text-green-600 dark:text-green-400" };
}

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

export function ShareLinksTable({ links }: { links: Link[] }) {
  const canWrite = useCanWrite("SHARE_LINKS");
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  if (links.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No share links.
      </p>
    );
  }

  const byType = new Map<string, Link[]>();
  for (const link of links) {
    const key = link.reportType;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(link);
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    await revokeShareLink(id);
    setRevoking(null);
    setConfirmingRevoke(null);
    router.refresh();
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(shareUrl(token)).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="space-y-8">
      {Array.from(byType.entries()).map(([reportType, typeLinks]) => (
        <div key={reportType}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            {SHARE_REPORT_LABELS[reportType] ?? reportType}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Label</th>
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
                {typeLinks.map((link) => {
                  const status = linkStatus(link);
                  return (
                    <tr key={link.id}>
                      <td className="py-2 pr-4 text-gray-900 dark:text-white">
                        {link.label || <span className="text-gray-400 dark:text-gray-500 italic">Untitled</span>}
                        {!link.filtersLocked && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(unlocked)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                        {link.createdBy?.name ?? link.createdBy?.email ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(link.createdAt)}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(link.expiresAt)}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(link.lastAccessedAt)}
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400">
                        {link.accessCount}
                      </td>
                      <td className={`py-2 pr-4 text-xs ${status.cls}`}>{status.label}</td>
                      <td className="py-2 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {!link.revokedAt && (
                            <button
                              type="button"
                              onClick={() => handleCopy(link.token)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {copied === link.token ? "Copied" : "Copy"}
                            </button>
                          )}
                          {canWrite && !link.revokedAt && !(link.expiresAt && new Date(link.expiresAt) < new Date()) && (
                            confirmingRevoke === link.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRevoke(link.id)}
                                  disabled={revoking === link.id}
                                  className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                                >
                                  {revoking === link.id ? "Revoking..." : "Confirm revoke"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingRevoke(null)}
                                  disabled={revoking === link.id}
                                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingRevoke(link.id)}
                                className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                              >
                                Revoke
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
