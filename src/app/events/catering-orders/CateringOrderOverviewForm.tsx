"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { CateringOrder, CustomOption } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";

type CateringOrderOverviewFormProps = {
  cateringOrder: CateringOrder;
  action: (formData: FormData) => Promise<void>;
  serviceStyleOptions: CustomOption[];
  linkedFunctionId: string | null;
  linkedFunctionName: string | null;
  linkedFunctionPath: string | null;
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: () => Promise<void>;
};


function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save"}
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
}: Pick<CateringOrderOverviewFormProps, "linkedFunctionId" | "linkedFunctionName" | "linkedFunctionPath" | "availableFunctions" | "linkFunction" | "unlinkFunction">) {
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
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Linked Function</dt>
      <dd className="mt-1">
        {linkedFunctionId && linkedFunctionName ? (
          <div className="flex items-center gap-3">
            <Link href={linkedFunctionPath!} className="text-sm text-blue-600 hover:underline">
              {linkedFunctionName}
            </Link>
            <button
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
              <p className="text-sm text-gray-500 dark:text-gray-400">No unlinked functions available.</p>
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
                  onClick={handleLink}
                  disabled={!selectedId || isLinking}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLinking ? "Linking..." : "Link"}
                </button>
              </div>
            )}
            <button onClick={() => setShowLinkForm(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLinkForm(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            Link to function
          </button>
        )}
      </dd>
    </div>
  );
}

export function CateringOrderOverviewForm({
  cateringOrder,
  action,
  serviceStyleOptions,
  linkedFunctionId,
  linkedFunctionName,
  linkedFunctionPath,
  availableFunctions,
  linkFunction,
  unlinkFunction,
}: CateringOrderOverviewFormProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Details</h2>
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          </div>
          <dl className="space-y-4">
            <ReadOnlyField label="Name" value={cateringOrder.name} />
            <ReadOnlyField
              label="Service Style"
              value={serviceStyleOptions.find((o) => o.value === cateringOrder.serviceStyle)?.label ?? cateringOrder.serviceStyle}
            />
            <FunctionLinkControl
              linkedFunctionId={linkedFunctionId}
              linkedFunctionName={linkedFunctionName}
              linkedFunctionPath={linkedFunctionPath}
              availableFunctions={availableFunctions}
              linkFunction={linkFunction}
              unlinkFunction={unlinkFunction}
            />
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Guest Counts</h2>
          <dl className="grid grid-cols-3 gap-4">
            <ReadOnlyField label="Expected" value={cateringOrder.expectedCount != null ? String(cateringOrder.expectedCount) : null} />
            <ReadOnlyField label="Confirmed" value={cateringOrder.confirmedCount != null ? String(cateringOrder.confirmedCount) : null} />
            <ReadOnlyField label="Guarantee" value={cateringOrder.guaranteeCount != null ? String(cateringOrder.guaranteeCount) : null} />
          </dl>
        </div>
      </div>
    );
  }

  return (
    <form action={async (formData) => { await action(formData); setEditing(false); }} className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Details</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={cateringOrder.name}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="serviceStyle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Service Style
            </label>
            <select
              id="serviceStyle"
              name="serviceStyle"
              defaultValue={cateringOrder.serviceStyle || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {serviceStyleOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Guest Counts</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="expectedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected
            </label>
            <input
              type="number"
              id="expectedCount"
              name="expectedCount"
              defaultValue={cateringOrder.expectedCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirmedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirmed
            </label>
            <input
              type="number"
              id="confirmedCount"
              name="confirmedCount"
              defaultValue={cateringOrder.confirmedCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="guaranteeCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Guarantee
            </label>
            <input
              type="number"
              id="guaranteeCount"
              name="guaranteeCount"
              defaultValue={cateringOrder.guaranteeCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <SaveButton />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
