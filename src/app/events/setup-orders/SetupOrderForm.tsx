"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { CustomOption } from "@prisma/client";

type SetupOrderData = {
  id: string;
  description?: string | null;
  setupType?: string | null;
  notes?: string | null;
  roomId?: string | null;
  functionId?: string | null;
  function?: { id: string; name: string } | null;
  room?: { id: string; name: string } | null;
};

type FunctionLinkProps = {
  linkedFunctionId: string | null;
  linkedFunctionName: string | null;
  linkedFunctionPath: string | null;
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: () => Promise<void>;
};

type SetupOrderFormProps = {
  setupOrder?: SetupOrderData | null;
  eventId: string;
  setupTypes: CustomOption[];
  action: (formData: FormData) => Promise<void>;
  functionLink?: FunctionLinkProps;
  rooms?: { id: string; name: string }[];
  functions?: { id: string; name: string; roomIds: string[] }[];
  initialRoomId?: string;
  initialFunctionId?: string;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Setup Order" : "Create Setup Order"}
    </button>
  );
}

function FunctionLinkControl({
  linkedFunctionId,
  linkedFunctionName,
  linkedFunctionPath,
  availableFunctions,
  linkFunction,
  unlinkFunction,
}: FunctionLinkProps) {
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
          <Link href={linkedFunctionPath!} className="text-sm text-blue-600 hover:underline">
            {linkedFunctionName}
          </Link>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={isUnlinking}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
      ) : showLinkForm ? (
        <div className="space-y-2">
          {availableFunctions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No unlinked functions available for this room.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
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
          className="text-sm text-blue-600 hover:underline"
        >
          Link to function
        </button>
      )}
    </div>
  );
}

export function SetupOrderForm({
  setupOrder,
  eventId,
  setupTypes,
  action,
  functionLink,
  rooms = [],
  functions = [],
  initialRoomId,
  initialFunctionId,
}: SetupOrderFormProps) {
  const isEdit = !!setupOrder;
  const [selectedRoomId, setSelectedRoomId] = useState(
    setupOrder?.roomId ?? initialRoomId ?? ""
  );

  const filteredFunctions = selectedRoomId
    ? functions.filter((f) => f.roomIds.includes(selectedRoomId))
    : functions;

  return (
    <form action={action}>
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Setup Order Details
        </h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Room{!isEdit && <span className="text-red-500 ml-1">*</span>}
            </label>
            {rooms.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No rooms available. Add rooms to the event venue first.
              </p>
            ) : (
              <select
                id="roomId"
                name="roomId"
                required={!isEdit}
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select room —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>

          {!isEdit && (
            <div>
              <label htmlFor="functionId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Function <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="functionId"
                name="functionId"
                defaultValue={initialFunctionId ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No function —</option>
                {filteredFunctions.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {selectedRoomId && filteredFunctions.length === 0 && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No functions assigned to this room.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="setupType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Setup Type
            </label>
            {setupTypes.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No setup types defined.{" "}
                <a href="/settings" className="text-blue-600 hover:underline">
                  Add setup types in Settings
                </a>
              </p>
            ) : (
              <select
                id="setupType"
                name="setupType"
                defaultValue={setupOrder?.setupType || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select setup type —</option>
                {setupTypes.map((t) => (
                  <option key={t.id} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={setupOrder?.description || ""}
              placeholder="Optional clarifying note for this setup"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={setupOrder?.notes || ""}
              placeholder="Additional setup notes or instructions..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {functionLink && (
            <FunctionLinkControl {...functionLink} />
          )}
        </div>
      </div>

      <div className="flex gap-4 mt-6">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/events/${eventId}/setup-orders`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
