"use client";

import { useState } from "react";
import Link from "next/link";
import type { SetupOrder } from "@prisma/client";

type SetupOrderPanelProps = {
  setupOrder: SetupOrder | null;
  eventId: string;
  availableSetupOrders: SetupOrder[];
  newSetupOrderPath: string;
  linkSetupOrder: (setupOrderId: string) => Promise<void>;
  unlinkSetupOrder: () => Promise<void>;
};

export function SetupOrderPanel({
  setupOrder,
  eventId,
  availableSetupOrders,
  newSetupOrderPath,
  linkSetupOrder,
  unlinkSetupOrder,
}: SetupOrderPanelProps) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await linkSetupOrder(selectedId);
      setShowLinkForm(false);
      setSelectedId("");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Unlink this Setup Order? The Setup Order will not be deleted.")) return;
    setIsUnlinking(true);
    try {
      await unlinkSetupOrder();
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Setup Order</h2>

      {setupOrder ? (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div>
            <Link
              href={`/events/${eventId}/setup-orders/${setupOrder.id}`}
              className="text-blue-600 hover:underline font-medium text-sm"
            >
              {setupOrder.name}
            </Link>
            {setupOrder.setupType && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{setupOrder.setupType}</p>
            )}
          </div>
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No Setup Order linked.</p>

          {showLinkForm ? (
            <div className="space-y-3">
              {availableSetupOrders.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No unlinked Setup Orders available for this event.
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Setup Order...</option>
                    {availableSetupOrders.map((so) => (
                      <option key={so.id} value={so.id}>{so.name}</option>
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
                <Link href={newSetupOrderPath} className="text-blue-600 hover:underline">
                  Create new Setup Order
                </Link>
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
                Link Existing
              </button>
              <Link
                href={newSetupOrderPath}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create New
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
