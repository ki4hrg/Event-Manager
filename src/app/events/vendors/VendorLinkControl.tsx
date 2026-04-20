"use client";

import { useState } from "react";

export type AssignedVendor = { id: string; vendor: { id: string; name: string } };
export type AvailableVendor = { id: string; label: string };
export type VendorLinkEditProps = {
  assignedVendors: AssignedVendor[];
  availableVendors: AvailableVendor[];
  addVendor: (vendorId: string) => Promise<void>;
  removeVendor: (junctionId: string) => Promise<void>;
};

type CreateMode = {
  mode: "create";
  availableVendors: AvailableVendor[];
  fieldName?: string;
};

type EditMode = {
  mode: "edit";
  assignedVendors: AssignedVendor[];
  availableVendors: AvailableVendor[];
  addVendor: (vendorId: string) => Promise<void>;
  removeVendor: (junctionId: string) => Promise<void>;
};

type VendorLinkControlProps = CreateMode | EditMode;

export function VendorLinkControl(props: VendorLinkControlProps) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (props.mode === "create") {
    const { availableVendors, fieldName = "vendorId" } = props;
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Vendor
        </label>
        <select
          name={fieldName}
          defaultValue=""
          className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="">— None —</option>
          {availableVendors.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </div>
    );
  }

  const { assignedVendors, availableVendors, addVendor, removeVendor } = props;

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await addVendor(selectedId);
      setShowLinkForm(false);
      setSelectedId("");
    } finally {
      setIsLinking(false);
    }
  };

  const handleRemove = async (junctionId: string) => {
    if (!confirm("Remove this vendor?")) return;
    setRemovingId(junctionId);
    try {
      await removeVendor(junctionId);
    } finally {
      setRemovingId(null);
    }
  };

  const assignedVendorIds = new Set(assignedVendors.map((v) => v.vendor.id));
  const unassignedVendors = availableVendors.filter((v) => !assignedVendorIds.has(v.id));

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Vendor
      </label>
      {assignedVendors.length > 0 && (
        <ul className="space-y-1 mb-2">
          {assignedVendors.map((av) => (
            <li key={av.id} className="flex items-center gap-3">
              <span className="text-sm text-gray-900 dark:text-white">{av.vendor.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(av.id)}
                disabled={removingId === av.id}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {showLinkForm ? (
        <div className="space-y-2">
          {unassignedVendors.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No additional vendors available.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Select vendor...</option>
                {unassignedVendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleLink}
                disabled={!selectedId || isLinking}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLinking ? "Adding..." : "Add"}
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
          {assignedVendors.length === 0 ? "Add vendor" : "Add another vendor"}
        </button>
      )}
    </div>
  );
}
