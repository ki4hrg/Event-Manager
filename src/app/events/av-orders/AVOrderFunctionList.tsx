"use client";

import { useState } from "react";
import Link from "next/link";

type LinkedFunction = {
  id: string;
  name: string;
  detailPath: string;
};

type AVOrderFunctionListProps = {
  linkedFunctions: LinkedFunction[];
  availableFunctions: { id: string; label: string }[];
  linkFunction: (functionId: string) => Promise<void>;
  unlinkFunction: (functionId: string) => Promise<void>;
};

export function AVOrderFunctionList({
  linkedFunctions,
  availableFunctions,
  linkFunction,
  unlinkFunction,
}: AVOrderFunctionListProps) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await linkFunction(selectedId);
      setShowLinkForm(false);
      setSelectedId("");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (functionId: string, name: string) => {
    if (!confirm(`Unlink "${name}" from this AV Order?`)) return;
    setUnlinkingId(functionId);
    try {
      await unlinkFunction(functionId);
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Linked Functions</h2>

      {linkedFunctions.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {linkedFunctions.map((fn) => (
            <li
              key={fn.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              <Link
                href={fn.detailPath}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
              >
                {fn.name}
              </Link>
              <button
                onClick={() => handleUnlink(fn.id, fn.name)}
                disabled={unlinkingId === fn.id}
                className="text-red-600 hover:underline text-sm disabled:opacity-50"
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Not linked to any functions.
        </p>
      )}

      {showLinkForm ? (
        <div className="space-y-3">
          {availableFunctions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No unlinked functions available for this event.
            </p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select function...</option>
                {availableFunctions.map((fn) => (
                  <option key={fn.id} value={fn.id}>
                    {fn.label}
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
          Link Function
        </button>
      )}
    </div>
  );
}
