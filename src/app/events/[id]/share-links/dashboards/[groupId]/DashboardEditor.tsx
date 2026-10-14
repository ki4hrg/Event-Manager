"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SHARE_REPORT_LABELS } from "@/lib/shareLinks";
import { btnOutlinedXs } from "@/lib/buttonStyles";
import {
  updateShareLinkGroup,
  revokeShareLinkGroup,
  deleteShareLinkGroup,
  removeShareLinkGroupItem,
  reorderShareLinkGroupItems,
  updateShareLinkGroupItem,
} from "@/app/events/share-link-groups/actions";

type EditorGroup = {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

type EditorItem = {
  id: string;
  reportType: string;
  filtersLocked: boolean;
  label: string | null;
};

type Props = {
  eventId: string;
  group: EditorGroup;
  items: EditorItem[];
};

const REPORT_PATHS: Record<string, string> = {
  EQUIPMENT_RESPONSIBILITY: "equipment-responsibility",
  VENDOR_HANDOFF: "vendor-handoff",
  EVENT_PROFILE: "event-profile",
  EVENT_SCHEDULE: "event-schedule",
  ROOM_SCHEDULE: "room-schedule",
  FUNCTION_DETAIL: "function-detail",
  BREAKOUT_GRID: "breakout-grid",
  BREAKOUT_ASSIGNMENTS: "breakout-assignments",
  PACKING_LIST: "packing-list",
  ESG: "esg",
  POST_EVENT: "post-event",
  HOTEL_INFO: "hotel-info",
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export function DashboardEditor({ eventId, group, items }: Props) {
  const router = useRouter();
  const [label, setLabel] = useState(group.label ?? "");
  const [expiresAt, setExpiresAt] = useState(toDateInput(group.expiresAt));
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isRevoked = !!group.revokedAt;
  const isExpired = !!group.expiresAt && new Date(group.expiresAt) < new Date();
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/group/${group.token}` : `/share/group/${group.token}`;

  function saveLabel() {
    if ((label || null) === (group.label || null)) return;
    startTransition(async () => {
      await updateShareLinkGroup(group.id, { label: label || null });
      router.refresh();
    });
  }

  function saveExpiration() {
    const next = expiresAt || null;
    const current = group.expiresAt ? toDateInput(group.expiresAt) : "";
    if (next === (current || null)) return;
    startTransition(async () => {
      await updateShareLinkGroup(group.id, { expiresAt: expiresAt || null });
      router.refresh();
    });
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeShareLinkGroup(group.id);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteShareLinkGroup(group.id);
    });
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    const orderedIds = items.map((i) => i.id);
    [orderedIds[idx], orderedIds[next]] = [orderedIds[next], orderedIds[idx]];
    startTransition(async () => {
      await reorderShareLinkGroupItems(group.id, orderedIds);
      router.refresh();
    });
  }

  function toggleItemLock(itemId: string, current: boolean) {
    startTransition(async () => {
      await updateShareLinkGroupItem(itemId, { filtersLocked: !current });
      router.refresh();
    });
  }

  function saveItemLabel(itemId: string, value: string, original: string | null) {
    if ((value || null) === (original || null)) return;
    startTransition(async () => {
      await updateShareLinkGroupItem(itemId, { label: value || null });
      router.refresh();
    });
  }

  function removeItem(itemId: string) {
    startTransition(async () => {
      await removeShareLinkGroupItem(itemId);
      router.refresh();
    });
  }

  function startAddReport(reportType: string) {
    const path = REPORT_PATHS[reportType];
    if (!path) return;
    router.push(`/events/${eventId}/reports/${path}?addToDashboard=${group.id}`);
  }

  const status = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";
  const statusCls = isRevoked
    ? "text-red-600 dark:text-red-400"
    : isExpired
      ? "text-amber-600 dark:text-amber-400"
      : "text-green-600 dark:text-green-400";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Dashboard</h2>
          <span className={`text-xs font-medium ${statusCls}`}>{status}</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              placeholder="e.g. Vendor Briefing"
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
              onBlur={saveExpiration}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Share URL
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-3 py-1.5 focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className={`shrink-0 ${btnOutlinedXs}`}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-medium text-gray-900 dark:text-white">Reports in this dashboard</h3>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            disabled={isPending}
          >
            + Add report
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No reports yet.
          </p>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700">
            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                idx={idx}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                eventId={eventId}
                isPending={isPending}
                onMoveUp={() => moveItem(idx, -1)}
                onMoveDown={() => moveItem(idx, 1)}
                onToggleLock={() => toggleItemLock(item.id, item.filtersLocked)}
                onSaveLabel={(value) => saveItemLabel(item.id, value, item.label)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
        {!isRevoked && !confirmingRevoke && (
          <button
            type="button"
            onClick={() => setConfirmingRevoke(true)}
            disabled={isPending}
            className="text-sm text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50"
          >
            Revoke
          </button>
        )}
        {!isRevoked && confirmingRevoke && (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-amber-700 dark:text-amber-400">Revoke this dashboard link?</span>
            <button
              type="button"
              onClick={() => {
                setConfirmingRevoke(false);
                handleRevoke();
              }}
              disabled={isPending}
              className="text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50"
            >
              Yes, revoke
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRevoke(false)}
              disabled={isPending}
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </span>
        )}
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            Delete dashboard
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-red-600 dark:text-red-400">Delete this dashboard?</span>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={isPending}
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </span>
        )}
        <Link
          href={`/events/${eventId}/share-links`}
          className="ml-auto text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          Back to share links
        </Link>
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add a report</h2>
              <button
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
                className="-m-1 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-5 py-4 space-y-2 overflow-y-auto">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                You&apos;ll be taken to the report to configure filters, then add it back here.
              </p>
              {Object.keys(REPORT_PATHS).map((rt) => (
                <button
                  key={rt}
                  onClick={() => startAddReport(rt)}
                  className="w-full text-left px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-white"
                >
                  {SHARE_REPORT_LABELS[rt]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ItemRowProps = {
  item: EditorItem;
  idx: number;
  isFirst: boolean;
  isLast: boolean;
  eventId: string;
  isPending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleLock: () => void;
  onSaveLabel: (value: string) => void;
  onRemove: () => void;
};

function ItemRow({
  item,
  idx,
  isFirst,
  isLast,
  eventId,
  isPending,
  onMoveUp,
  onMoveDown,
  onToggleLock,
  onSaveLabel,
  onRemove,
}: ItemRowProps) {
  const [label, setLabel] = useState(item.label ?? "");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const baseLabel = SHARE_REPORT_LABELS[item.reportType] ?? item.reportType;
  const reportPath = REPORT_PATHS[item.reportType];

  return (
    <div className="p-3 flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst || isPending}
          aria-label="Move up"
          className="px-1.5 py-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 text-xs leading-none"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast || isPending}
          aria-label="Move down"
          className="px-1.5 py-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 text-xs leading-none"
        >
          ▼
        </button>
      </div>

      <div className="min-w-48 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {idx + 1}. {baseLabel}
        </p>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => onSaveLabel(label)}
          placeholder={`Tab label (defaults to "${baseLabel}")`}
          className="w-full text-sm bg-transparent border-0 border-b border-transparent focus:border-blue-500 focus:outline-none text-gray-900 dark:text-white px-0 py-0.5"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={item.filtersLocked}
          onChange={onToggleLock}
          disabled={isPending}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <span>Lock filters</span>
      </label>

      {reportPath && (
        <Link
          href={`/events/${eventId}/reports/${reportPath}`}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Open report
        </Link>
      )}

      {!confirmingRemove ? (
        <button
          onClick={() => setConfirmingRemove(true)}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50"
        >
          Remove
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-xs">
          <button
            onClick={onRemove}
            disabled={isPending}
            className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            onClick={() => setConfirmingRemove(false)}
            disabled={isPending}
            className="text-gray-500 dark:text-gray-400 hover:underline"
          >
            Cancel
          </button>
        </span>
      )}
    </div>
  );
}
