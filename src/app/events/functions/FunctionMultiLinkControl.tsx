"use client";

import { useState } from "react";
import Link from "next/link";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";

export type FunctionMultiLinkProps = {
  linkedFunctions: { id: string; name: string; path: string }[];
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: (id: string) => Promise<void>;
  // The owning order's resource — linking is a write on the order, not on the
  // function it points at.
  resource: PermissionResource;
};

export function FunctionMultiLinkControl({
  linkedFunctions,
  availableFunctions,
  linkFunction,
  unlinkFunction,
  resource,
}: FunctionMultiLinkProps) {
  const canWrite = useCanWrite(resource);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const linkedIds = new Set(linkedFunctions.map((f) => f.id));
  const unlinkedOptions = availableFunctions.filter((f) => !linkedIds.has(f.id));

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

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Linked Functions
      </label>
      <div className="space-y-1">
        {linkedFunctions.map((f) => (
          <div key={f.id} className="flex items-center gap-3">
            <Link href={f.path} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {f.name}
            </Link>
            {canWrite && (
              <InlineConfirmButton
                onConfirm={() => unlinkFunction(f.id)}
                label="Unlink"
                confirmLabel="Unlink"
                resource={resource}
                requiredLevel="WRITE"
                className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
              />
            )}
          </div>
        ))}
      </div>

      {!canWrite ? (
        linkedFunctions.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">None linked.</p>
        )
      ) : showLinkForm ? (
        <div className="space-y-2 mt-2">
          {unlinkedOptions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No unlinked functions available.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Select function...</option>
                {unlinkedOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
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
            onClick={() => setShowLinkForm(false)}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowLinkForm(true)}
          className={`mt-2 ${btnOutlinedSm}`}
        >
          Link Function
        </button>
      )}
    </div>
  );
}
