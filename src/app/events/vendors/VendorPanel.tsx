"use client";

import { useState } from "react";
import Link from "next/link";
import type { Vendor } from "@prisma/client";
import { MODEL_LABELS } from "@/app/vendors/model-types";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";

type AssignedVendor = {
  id: string;
  notes: string | null;
  vendor: Vendor;
};

const DROPDOWN_THRESHOLD = 5;

type VendorPanelProps = {
  assignedVendors: AssignedVendor[];
  availableVendors: Vendor[];
  eventId: string;
  searchEventVendors: (query: string) => Promise<Vendor[]>;
  addVendor: (vendorId: string, notes: string) => Promise<void>;
  updateVendor: (id: string, notes: string) => Promise<void>;
  removeVendor: (id: string) => Promise<void>;
};

export function VendorPanel({
  assignedVendors,
  availableVendors,
  eventId,
  searchEventVendors,
  addVendor,
  updateVendor,
  removeVendor,
}: VendorPanelProps) {
  // These junction writes gate on the VENDORS catalog, not the order — see
  // addVendorToOrder cores in src/app/vendors/core.ts.
  const canWrite = useCanWrite("VENDORS");
  const canDelete = useCanDelete("VENDORS");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");

  const assignedIdSet = new Set(assignedVendors.map((v) => v.vendor.id));
  const unassignedVendors = availableVendors.filter((v) => !assignedIdSet.has(v.id));
  const useDropdown = unassignedVendors.length <= DROPDOWN_THRESHOLD;

  const search = useDebouncedSearch(searchEventVendors, { enabled: !useDropdown });
  const searchResults = search.results.filter((v) => !assignedIdSet.has(v.id));

  const handleSelect = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    search.clear();
  };

  const handleAdd = async () => {
    if (!selectedVendor) return;
    await addVendor(selectedVendor.id, notes);
    setSelectedVendor(null);
    setNotes("");
    setShowAddForm(false);
  };

  const handleEditStart = (item: AssignedVendor) => {
    setEditingId(item.id);
    setEditNotes(item.notes || "");
  };

  const handleEditSave = async (id: string) => {
    await updateVendor(id, editNotes);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Vendors</h2>
        {canWrite && (
          <button
            onClick={() => {
              setShowAddForm(true);
              setSelectedVendor(null);
              search.clear();
              setNotes("");
            }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Vendor
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
          {!selectedVendor ? (
            useDropdown ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Event Vendor
                </label>
                {unassignedVendors.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No additional vendors available.{" "}
                    <Link href={`/events/${eventId}/vendors`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      Manage event vendors
                    </Link>
                  </p>
                ) : (
                  <select
                    autoFocus
                    value=""
                    onChange={(e) => {
                      const v = unassignedVendors.find((u) => u.id === e.target.value);
                      if (v) handleSelect(v);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Select vendor...</option>
                    {unassignedVendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                        {vendor.models.length > 0
                          ? ` — ${vendor.models.map((m) => MODEL_LABELS[m] || m).join(", ")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search Event Vendors
                </label>
                <input
                  type="text"
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder="Search by vendor name..."
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                {search.isSearching && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
                )}
                {searchResults.length > 0 && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md max-h-40 overflow-y-auto">
                    {searchResults.map((vendor) => (
                      <button
                        key={vendor.id}
                        type="button"
                        onClick={() => handleSelect(vendor)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                      >
                        <span className="text-gray-900 dark:text-white font-medium">{vendor.name}</span>
                        {vendor.models.length > 0 && (
                          <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">
                            {vendor.models.map((m) => MODEL_LABELS[m] || m).join(", ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {search.query.length >= 2 && !search.isSearching && searchResults.length === 0 && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    No vendors found.{" "}
                    <Link href={`/events/${eventId}/vendors`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      Manage event vendors
                    </Link>
                  </p>
                )}
              </div>
            )
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selected Vendor
              </label>
              <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <span className="text-gray-900 dark:text-white">{selectedVendor.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedVendor(null)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedVendor}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Add Vendor
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setSelectedVendor(null);
                search.clear();
                setNotes("");
              }}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {assignedVendors.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No vendors assigned.</p>
      ) : (
        <div className="space-y-2">
          {assignedVendors.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <div className="font-medium text-gray-900 dark:text-white text-sm">{item.vendor.name}</div>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes..."
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSave(item.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 break-words">
                    <span className="text-gray-900 dark:text-white font-medium text-sm">
                      {item.vendor.name}
                    </span>
                    {item.vendor.models.length > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {item.vendor.models.map((m) => MODEL_LABELS[m] || m).join(", ")}
                      </span>
                    )}
                    {item.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {canWrite && (
                      <button
                        onClick={() => handleEditStart(item)}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={async () => {
                          if (confirm("Remove this vendor?")) {
                            await removeVendor(item.id);
                          }
                        }}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
