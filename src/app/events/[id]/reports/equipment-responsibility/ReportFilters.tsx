"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MODEL_TYPES } from "@/app/vendors/model-types";

type VendorOption = { id: string; name: string };

type ReportFiltersProps = {
  eventId: string;
  vendors: VendorOption[];
  selectedVendorIds: string[];
  selectedModelTypes: string[];
  basePath?: string;
  shareButton?: React.ReactNode;
};

function toggleFilter(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function ReportFilters({ eventId, vendors, selectedVendorIds, selectedModelTypes, basePath = `/events/${eventId}/reports/equipment-responsibility`, shareButton }: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggleVendor(vendorId: string) {
    const next = toggleFilter(selectedVendorIds, vendorId);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set("vendors", next.join(","));
    } else {
      params.delete("vendors");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function toggleModel(value: string) {
    const next = toggleFilter(selectedModelTypes, value);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set("models", next.join(","));
    } else {
      params.delete("models");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(basePath);
  }

  const hasFilters = selectedVendorIds.length > 0 || selectedModelTypes.length > 0;

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-start gap-6">
      {vendors.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Vendor</p>
          <div className="flex flex-wrap gap-2">
            {vendors.map((v) => {
              const active = selectedVendorIds.includes(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggleVendor(v.id)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    active
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Order Type</p>
        <div className="flex flex-wrap gap-2">
          {MODEL_TYPES.map(({ value, label }) => {
            const active = selectedModelTypes.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggleModel(value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  active
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-end gap-3 ml-auto">
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear filters
          </button>
        )}
        {shareButton}
        <a
          href={`${basePath}/print${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          Print / Save PDF
        </a>
      </div>
    </div>
  );
}
