"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { EventVendor, Vendor } from "@prisma/client";
import type { ModelType } from "@/app/vendors/actions";
import { MODEL_TYPES, MODEL_LABELS } from "@/app/vendors/model-types";

type EventVendorWithVendor = EventVendor & { vendor: Vendor };

type EventVendorListProps = {
  eventVendors: EventVendorWithVendor[];
  searchVendors: (query: string) => Promise<Vendor[]>;
  addVendor: (vendorId: string) => Promise<void>;
  removeVendor: (eventVendorId: string) => Promise<void>;
  setDefault: (eventVendorId: string, modelType: ModelType) => Promise<void>;
  removeDefault: (eventVendorId: string, modelType: ModelType) => Promise<void>;
};

export function EventVendorList({
  eventVendors,
  searchVendors,
  addVendor,
  removeVendor,
  setDefault,
  removeDefault,
}: EventVendorListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Vendor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchVendors(searchQuery);
        setSearchResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchVendors]);

  const handleAdd = async (vendorId: string) => {
    await addVendor(vendorId);
    setShowAddForm(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleToggleDefault = async (ev: EventVendorWithVendor, modelType: ModelType) => {
    const key = `${ev.id}:${modelType}`;
    if (pendingToggles.has(key)) return;
    setPendingToggles((prev) => new Set(prev).add(key));
    try {
      if (ev.defaultFor.includes(modelType)) {
        await removeDefault(ev.id, modelType);
      } else {
        await setDefault(ev.id, modelType);
      }
    } finally {
      setPendingToggles((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Vendors</h2>
        <button
          onClick={() => {
            setShowAddForm(true);
            setSearchQuery("");
            setSearchResults([]);
          }}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Vendor
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search Vendors
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by vendor name..."
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
          {isSearching && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto">
              {searchResults.map((vendor) => (
                <button
                  key={vendor.id}
                  type="button"
                  onClick={() => handleAdd(vendor.id)}
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
          {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No vendors found.{" "}
              <Link href="/vendors/new" className="text-blue-600 dark:text-blue-400 hover:underline">
                Create a new vendor
              </Link>
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setShowAddForm(false);
              setSearchQuery("");
            }}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      )}

      {eventVendors.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No vendors assigned to this event yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Types
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Default For
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {eventVendors.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/vendors/${ev.vendorId}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
                    >
                      {ev.vendor.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {ev.vendor.models.map((model) => (
                        <span
                          key={model}
                          className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {MODEL_LABELS[model] || model}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-3">
                      {MODEL_TYPES.map(({ value, label }) => {
                        const key = `${ev.id}:${value}`;
                        const isChecked = ev.defaultFor.includes(value);
                        const isPending = pendingToggles.has(key);
                        return (
                          <label
                            key={value}
                            className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isPending}
                              onChange={() => handleToggleDefault(ev, value)}
                              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 disabled:opacity-50"
                            />
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={async () => {
                        if (confirm(`Remove ${ev.vendor.name} from this event?`)) {
                          await removeVendor(ev.id);
                        }
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
