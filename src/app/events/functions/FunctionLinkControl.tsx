"use client";

import { useState } from "react";
import Link from "next/link";
import { btnOutlinedSm, btnPrimarySm } from "@/lib/buttonStyles";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";

export type FunctionLinkProps = {
  linkedFunctionId: string | null | undefined;
  linkedFunctionName: string | null | undefined;
  linkedFunctionPath: string | null | undefined;
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: () => Promise<void>;
  // The owning order's resource — linking is a write on the order, not on the
  // function it points at.
  resource: PermissionResource;
};

export function FunctionLinkControl({
  linkedFunctionId,
  linkedFunctionName,
  linkedFunctionPath,
  availableFunctions,
  linkFunction,
  unlinkFunction,
  resource,
}: FunctionLinkProps) {
  const canWrite = useCanWrite(resource);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

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

  const handleUnlink = async () => {
    if (!confirm("Unlink this function?")) return;
    setIsUnlinking(true);
    try {
      await unlinkFunction();
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Linked Function
      </label>
      {linkedFunctionId && linkedFunctionName ? (
        <div className="flex items-center gap-3">
          <Link href={linkedFunctionPath!} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {linkedFunctionName}
          </Link>
          {canWrite && (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={isUnlinking}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Unlink
            </button>
          )}
        </div>
      ) : !canWrite ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None linked.</p>
      ) : showLinkForm ? (
        <div className="space-y-2">
          {availableFunctions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No unlinked functions available.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Select function...</option>
                {availableFunctions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleLink}
                disabled={!selectedId || isLinking}
                className={`${btnPrimarySm} disabled:opacity-50`}
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
          className={btnOutlinedSm}
        >
          Link Function
        </button>
      )}
    </div>
  );
}
