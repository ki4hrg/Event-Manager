"use client";

import { useState } from "react";
import Link from "next/link";

type LinkedItem = { id: string; label: string; path: string };

type SupplyOrderLinkPanelProps = {
  linkedFunctions: LinkedItem[];
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: (id: string) => Promise<void>;
  linkedPresentations: LinkedItem[];
  availablePresentations: { id: string; label: string }[];
  linkPresentation: (id: string) => Promise<void>;
  unlinkPresentation: (id: string) => Promise<void>;
};

function MultiLinkSection({
  title,
  emptyMessage,
  linked,
  available,
  linkLabel,
  linkItem,
  unlinkItem,
}: {
  title: string;
  emptyMessage: string;
  linked: LinkedItem[];
  available: { id: string; label: string }[];
  linkLabel: string;
  linkItem: (id: string) => Promise<void>;
  unlinkItem: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await linkItem(selectedId);
      setShowForm(false);
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
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h2>

      <div className="space-y-1 mb-3">
        {linked.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        )}
        {linked.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <Link href={item.path} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {item.label}
            </Link>
            <button
              type="button"
              onClick={() => handleUnlink(item.id, item.label)}
              disabled={unlinkingId === item.id}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Unlink
            </button>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="space-y-2">
          {available.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No additional options available.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Select...</option>
                {available.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleLink}
                disabled={!selectedId || isLinking}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLinking ? "Linking..." : "Link"}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {linkLabel}
        </button>
      )}
    </div>
  );
}

export function SupplyOrderLinkPanel({
  linkedFunctions,
  availableFunctions,
  linkFunction,
  unlinkFunction,
  linkedPresentations,
  availablePresentations,
  linkPresentation,
  unlinkPresentation,
}: SupplyOrderLinkPanelProps) {
  return (
    <div className="space-y-6">
      <MultiLinkSection
        title="Linked Functions"
        emptyMessage="Not linked to any functions."
        linked={linkedFunctions}
        available={availableFunctions}
        linkLabel="Link to function"
        linkItem={linkFunction}
        unlinkItem={unlinkFunction}
      />
      <MultiLinkSection
        title="Linked Presentations"
        emptyMessage="Not linked to any presentations."
        linked={linkedPresentations}
        available={availablePresentations}
        linkLabel="Link to presentation"
        linkItem={linkPresentation}
        unlinkItem={unlinkPresentation}
      />
    </div>
  );
}
