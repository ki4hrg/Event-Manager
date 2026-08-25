"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShareLink, revokeShareLink, listShareLinksForReport } from "@/app/events/share-links/actions";
import { addShareLinkGroupItem, createShareLinkGroup } from "@/app/events/share-link-groups/actions";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { useCanWrite } from "@/components/PermissionsProvider";

type ExistingLink = {
  id: string;
  label: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  accessCount: number;
  token: string;
};

export type DashboardChoice = {
  id: string;
  label: string | null;
  itemCount: number;
};

type ShareReportButtonProps = {
  eventId: string;
  reportType: string;
  currentFilters: ShareLinkFilters;
  dashboardChoices?: DashboardChoice[];
  addToDashboardId?: string;
};

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function linkStatus(link: ExistingLink): { label: string; cls: string } {
  if (link.revokedAt) return { label: "Revoked", cls: "text-red-600 dark:text-red-400" };
  if (link.expiresAt && new Date(link.expiresAt) < new Date())
    return { label: "Expired", cls: "text-amber-600 dark:text-amber-400" };
  return { label: "Active", cls: "text-green-600 dark:text-green-400" };
}

type Mode = "single" | "dashboard";

export function ShareReportButton({ eventId, reportType, currentFilters, dashboardChoices, addToDashboardId }: ShareReportButtonProps) {
  // Creating a share link is a SHARE_LINKS write, so the button disappears for
  // a read-only viewer rather than offering a dialog that can't be submitted.
  const canWrite = useCanWrite("SHARE_LINKS");
  const router = useRouter();
  const hasDashboards = !!dashboardChoices;
  const isAddingToDashboard = !!addToDashboardId;
  const targetDashboard = isAddingToDashboard
    ? dashboardChoices?.find((d) => d.id === addToDashboardId)
    : undefined;
  const targetDashboardName = targetDashboard?.label || "Untitled dashboard";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(addToDashboardId ? "dashboard" : "single");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [filtersLocked, setFiltersLocked] = useState(true);
  const [dashboardId, setDashboardId] = useState<string>(addToDashboardId ?? "");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([]);
  const [isPending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || isAddingToDashboard) return;
    let cancelled = false;
    listShareLinksForReport(eventId, reportType)
      .then((links) => {
        if (!cancelled) setExistingLinks(links as ExistingLink[]);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load existing share links.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, eventId, reportType, isAddingToDashboard]);

  function handleOpen() {
    setMode(addToDashboardId ? "dashboard" : "single");
    setLabel("");
    setExpiresAt("");
    setFiltersLocked(true);
    const defaultDashboard =
      addToDashboardId ??
      (dashboardChoices && dashboardChoices.length > 0
        ? dashboardChoices[0].id
        : dashboardChoices
          ? "__new__"
          : "");
    setDashboardId(defaultDashboard);
    setCreatedToken(null);
    setCopied(false);
    setError(null);
    setOpen(true);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const filters = filtersLocked ? currentFilters : {};
        const link = await createShareLink({
          eventId,
          reportType,
          filters: filters as ShareLinkFilters,
          filtersLocked,
          label: label || undefined,
          expiresAt: expiresAt || null,
        });
        setCreatedToken(link.token);
        const updated = await listShareLinksForReport(eventId, reportType);
        setExistingLinks(updated as ExistingLink[]);
      } catch {
        setError("Couldn't create share link. Please try again.");
      }
    });
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      await revokeShareLink(id);
      const updated = await listShareLinksForReport(eventId, reportType);
      setExistingLinks(updated as ExistingLink[]);
    } catch {
      setError("Couldn't revoke share link. Please try again.");
    } finally {
      setRevoking(null);
    }
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(shareUrl(token)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleAddToDashboard() {
    setError(null);
    startTransition(async () => {
      try {
        let targetId = dashboardId;
        if (targetId === "__new__") {
          const created = await createShareLinkGroup({ eventId, label: label || null });
          targetId = created.id;
        }
        await addShareLinkGroupItem(targetId, {
          reportType,
          filters: currentFilters,
          filtersLocked,
          label: label || null,
        });
        setOpen(false);
        router.push(`/events/${eventId}/share-links/dashboards/${targetId}?success=Report+added+to+dashboard`);
      } catch {
        setError("Couldn't add report to dashboard. Please try again.");
      }
    });
  }

  const activeLinks = existingLinks.filter((l) => !l.revokedAt && !(l.expiresAt && new Date(l.expiresAt) < new Date()));

  if (!canWrite) return null;

  return (
    <>
      <button
        onClick={handleOpen}
        className={
          isAddingToDashboard
            ? "px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
            : "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        }
      >
        {isAddingToDashboard ? `Add to ${targetDashboardName}` : "Share"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {isAddingToDashboard ? `Add to ${targetDashboardName}` : "Share Report"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {error && (
                <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              {hasDashboards && !createdToken && !isAddingToDashboard && (
                <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded text-xs">
                  <button
                    onClick={() => setMode("single")}
                    className={`flex-1 px-3 py-1.5 rounded ${
                      mode === "single"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    Single link
                  </button>
                  <button
                    onClick={() => setMode("dashboard")}
                    className={`flex-1 px-3 py-1.5 rounded ${
                      mode === "dashboard"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    Add to dashboard
                  </button>
                </div>
              )}
              {!createdToken && mode === "single" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Label <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. AV Vendor Link"
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Expiration date <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filtersLocked}
                      onChange={(e) => setFiltersLocked(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Lock filters to current selection
                      <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        When checked, recipients see only the current filters. Uncheck to let them change filters.
                      </span>
                    </span>
                  </label>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setOpen(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={isPending}
                      className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                    >
                      {isPending ? "Creating..." : "Create link"}
                    </button>
                  </div>
                </>
              ) : !createdToken && mode === "dashboard" ? (
                <>
                  {!isAddingToDashboard && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Dashboard
                      </label>
                      <select
                        value={dashboardId}
                        onChange={(e) => setDashboardId(e.target.value)}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {dashboardChoices?.length === 0 && <option value="">(none yet)</option>}
                        {dashboardChoices?.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label || "Untitled dashboard"} ({d.itemCount} {d.itemCount === 1 ? "report" : "reports"})
                          </option>
                        ))}
                        <option value="__new__">+ New dashboard…</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tab label <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder={dashboardId === "__new__" ? "New dashboard label" : "Defaults to report name"}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filtersLocked}
                      onChange={(e) => setFiltersLocked(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Lock filters for this report
                      <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        When checked, recipients see only the current filters on this tab.
                      </span>
                    </span>
                  </label>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setOpen(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddToDashboard}
                      disabled={isPending || !dashboardId}
                      className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                    >
                      {isPending ? "Adding..." : isAddingToDashboard ? `Add to ${targetDashboardName}` : "Add to dashboard"}
                    </button>
                  </div>
                </>
              ) : !createdToken ? null : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300">Link created:</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl(createdToken)}
                      className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-3 py-1.5 focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopy(createdToken)}
                      className="shrink-0 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <button
                    onClick={() => setCreatedToken(null)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Create another link
                  </button>
                </div>
              )}

              {!isAddingToDashboard && existingLinks.length > 0 && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                    Existing links ({activeLinks.length} active)
                  </p>
                  <div className="space-y-2">
                    {existingLinks.map((link) => {
                      const status = linkStatus(link);
                      return (
                        <div
                          key={link.id}
                          className="flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                              {link.label || "Untitled"}
                            </p>
                            <p className="text-gray-400 dark:text-gray-500">
                              Created {formatDate(link.createdAt)}
                              {link.expiresAt && ` · Expires ${formatDate(link.expiresAt)}`}
                              {` · ${link.accessCount} view${link.accessCount !== 1 ? "s" : ""}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={status.cls}>{status.label}</span>
                            {!link.revokedAt && (
                              <>
                                <button
                                  onClick={() => handleCopy(link.token)}
                                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                                >
                                  Copy
                                </button>
                                <button
                                  onClick={() => handleRevoke(link.id)}
                                  disabled={revoking === link.id}
                                  className="text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50"
                                >
                                  {revoking === link.id ? "Revoking..." : "Revoke"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
