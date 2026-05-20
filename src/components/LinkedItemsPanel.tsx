"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type LinkedItem = {
  id: string;
  label: string;
  detailPath: string;
  metadata?: ReactNode;
};

type LinkedItemsPanelProps = {
  title: string;
  items: LinkedItem[];
  availableItems: { id: string; label: string }[];
  linkLabel?: string;
  emptyMessage?: string;
  newItemPath?: string;
  newItemLabel?: string;
  linkItem: (id: string) => Promise<void>;
  unlinkItem: (id: string) => Promise<void>;
};

export function LinkedItemsPanel({
  title,
  items,
  availableItems,
  linkLabel = "Link",
  emptyMessage = "None linked.",
  newItemPath,
  newItemLabel,
  linkItem,
  unlinkItem,
}: LinkedItemsPanelProps) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await linkItem(selectedId);
      setShowLinkForm(false);
      setSelectedId("");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (id: string, label: string) => {
    if (!confirm(`Unlink "${label}"?`)) return;
    setUnlinkingId(id);
    try {
      await unlinkItem(id);
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 h-full flex flex-col">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h2>

      {items.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={item.detailPath}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
                >
                  {item.label}
                </Link>
                {item.metadata && (
                  <div className="mt-1">{item.metadata}</div>
                )}
              </div>
              <button
                onClick={() => handleUnlink(item.id, item.label)}
                disabled={unlinkingId === item.id}
                className="text-red-600 hover:underline text-sm disabled:opacity-50 flex-shrink-0"
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{emptyMessage}</p>
      )}

      {showLinkForm ? (
        <div className="space-y-3">
          {availableItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nothing available to link.
            </p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select…</option>
                {availableItems.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={handleLink}
                disabled={!selectedId || isLinking}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isLinking ? "Linking..." : "Link"}
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            {newItemPath && (
              <Link href={newItemPath} className="text-blue-600 dark:text-blue-400 hover:underline">
                {newItemLabel ?? "Create new"}
              </Link>
            )}
            <button
              onClick={() => setShowLinkForm(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLinkForm(true)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            {linkLabel}
          </button>
          {newItemPath && (
            <Link
              href={newItemPath}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {newItemLabel ?? "Create New"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
