"use client";

import { useState } from "react";
import Link from "next/link";
import { useCanWrite } from "@/components/PermissionsProvider";

type LinkedFunction = { id: string; name: string; path: string };
type LinkedPresentation = { id: string; title: string; path: string } | null;

type PrintOrderLinkPanelProps = {
  eventId: string;
  linkedFunctions: LinkedFunction[];
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: (id: string) => Promise<void>;
  linkedPresentation: LinkedPresentation;
  availablePresentations: { id: string; label: string }[];
  linkPresentation: (id: string) => Promise<void>;
  unlinkPresentation: () => Promise<void>;
};

export function PrintOrderLinkPanel({
  eventId: _eventId,
  linkedFunctions,
  availableFunctions,
  linkFunction,
  unlinkFunction,
  linkedPresentation,
  availablePresentations,
  linkPresentation,
  unlinkPresentation,
}: PrintOrderLinkPanelProps) {
  const canWrite = useCanWrite("PRINT_ORDERS");
  const [showFunctionForm, setShowFunctionForm] = useState(false);
  const [selectedFunctionId, setSelectedFunctionId] = useState("");
  const [isLinkingFunction, setIsLinkingFunction] = useState(false);
  const [unlinkingFunctionId, setUnlinkingFunctionId] = useState<string | null>(null);

  const [showPresentationForm, setShowPresentationForm] = useState(false);
  const [selectedPresentationId, setSelectedPresentationId] = useState("");
  const [isLinkingPresentation, setIsLinkingPresentation] = useState(false);
  const [isUnlinkingPresentation, setIsUnlinkingPresentation] = useState(false);

  const handleLinkFunction = async () => {
    if (!selectedFunctionId) return;
    setIsLinkingFunction(true);
    try {
      await linkFunction(selectedFunctionId);
      setShowFunctionForm(false);
      setSelectedFunctionId("");
    } finally {
      setIsLinkingFunction(false);
    }
  };

  const handleUnlinkFunction = async (id: string, name: string) => {
    if (!confirm(`Unlink "${name}"?`)) return;
    setUnlinkingFunctionId(id);
    try {
      await unlinkFunction(id);
    } finally {
      setUnlinkingFunctionId(null);
    }
  };

  const handleLinkPresentation = async () => {
    if (!selectedPresentationId) return;
    setIsLinkingPresentation(true);
    try {
      await linkPresentation(selectedPresentationId);
      setShowPresentationForm(false);
      setSelectedPresentationId("");
    } finally {
      setIsLinkingPresentation(false);
    }
  };

  const handleUnlinkPresentation = async () => {
    if (!confirm("Unlink this presentation?")) return;
    setIsUnlinkingPresentation(true);
    try {
      await unlinkPresentation();
    } finally {
      setIsUnlinkingPresentation(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Functions */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Linked Functions</h2>

        <div className="space-y-1 mb-3">
          {linkedFunctions.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Not linked to any functions.</p>
          )}
          {linkedFunctions.map((f) => (
            <div key={f.id} className="flex items-center gap-3">
              <Link href={f.path} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                {f.name}
              </Link>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => handleUnlinkFunction(f.id, f.name)}
                  disabled={unlinkingFunctionId === f.id}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Unlink
                </button>
              )}
            </div>
          ))}
        </div>

        {!canWrite ? null : showFunctionForm ? (
          <div className="space-y-2">
            {availableFunctions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No additional functions available.</p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedFunctionId}
                  onChange={(e) => setSelectedFunctionId(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Select function...</option>
                  {availableFunctions.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLinkFunction}
                  disabled={!selectedFunctionId || isLinkingFunction}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLinkingFunction ? "Linking..." : "Link"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowFunctionForm(false)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowFunctionForm(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Link to function
          </button>
        )}
      </div>

      {/* Presentation */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Linked Presentation</h2>

        {linkedPresentation ? (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <Link href={linkedPresentation.path} className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">
              {linkedPresentation.title}
            </Link>
            {canWrite && (
              <button
                type="button"
                onClick={handleUnlinkPresentation}
                disabled={isUnlinkingPresentation}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Unlink
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Not linked to a presentation.</p>

            {!canWrite ? null : showPresentationForm ? (
              <div className="space-y-2">
                {availablePresentations.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No unlinked presentations available for this event.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={selectedPresentationId}
                      onChange={(e) => setSelectedPresentationId(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">Select presentation...</option>
                      {availablePresentations.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleLinkPresentation}
                      disabled={!selectedPresentationId || isLinkingPresentation}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isLinkingPresentation ? "Linking..." : "Link"}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowPresentationForm(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPresentationForm(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Link to presentation
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
