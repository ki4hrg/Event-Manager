"use client";

import { useRouter, useSearchParams } from "next/navigation";

type VendorOption = { id: string; name: string };

type ReportFiltersProps = {
  eventId: string;
  vendors: VendorOption[];
  selectedVendorId: string | null;
  basePath?: string;
  shareButton?: React.ReactNode;
};

export function ReportFilters({ eventId, vendors, selectedVendorId, basePath = `/events/${eventId}/reports/vendor-handoff`, shareButton }: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleVendorChange(vendorId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (vendorId) {
      params.set("vendorId", vendorId);
    } else {
      params.delete("vendorId");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-end gap-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Vendor
        </label>
        <select
          value={selectedVendorId ?? ""}
          onChange={(e) => handleVendorChange(e.target.value)}
          className="block rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a vendor...</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {(shareButton || selectedVendorId) && (
        <div className="ml-auto flex items-center gap-3">
          {shareButton}
          {selectedVendorId && (
            <a
              href={`${basePath}/print?vendorId=${selectedVendorId}`}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Print / Save PDF
            </a>
          )}
        </div>
      )}
    </div>
  );
}
