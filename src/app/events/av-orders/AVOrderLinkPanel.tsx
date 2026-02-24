"use client";

import { useState } from "react";
import Link from "next/link";

type AVOrderLinkPanelProps = {
  title: string;
  linkedId: string | null;
  linkedName: string | null;
  linkedDetailPath: string | null;
  availableItems: { id: string; label: string }[];
  newItemPath: string;
  linkItem: (id: string) => Promise<void>;
  unlinkItem: () => Promise<void>;
  entityLabel: string;
};

export function AVOrderLinkPanel({
  title,
  linkedId,
  linkedName,
  linkedDetailPath,
  availableItems,
  newItemPath: _newItemPath,
  linkItem,
  unlinkItem,
  entityLabel,
}: AVOrderLinkPanelProps) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

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

  const handleUnlink = async () => {
    if (!confirm(`Unlink this ${entityLabel}?`)) return;
    setIsUnlinking(true);
    try {
      await unlinkItem();
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h2>

      {linkedId && linkedName ? (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <Link
            href={linkedDetailPath!}
            className="text-blue-600 hover:underline font-medium text-sm"
          >
            {linkedName}
          </Link>
          <button
            onClick={handleUnlink}
            disabled={isUnlinking}
            className="text-red-600 hover:underline text-sm disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Not linked to a {entityLabel}.
          </p>

          {showLinkForm ? (
            <div className="space-y-3">
              {availableItems.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No unlinked {entityLabel}s available for this event.
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select {entityLabel}...</option>
                    {availableItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
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
              <button
                onClick={() => setShowLinkForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLinkForm(true)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Link to {entityLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
