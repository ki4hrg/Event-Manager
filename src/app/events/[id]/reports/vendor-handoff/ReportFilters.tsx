"use client";

import { ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type VendorOption = { id: string; name: string };

type ReportFiltersProps = {
  eventId: string;
  vendors: VendorOption[];
  selectedVendorId: string | null;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

export function ReportFilters({ eventId, vendors, selectedVendorId, basePath = `/events/${eventId}/reports/vendor-handoff`, paramPrefix = "", shareButton, hidePrint = false }: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  // Print needs a vendor; it carries only that vendor, not the rest of the URL.
  const printHref = selectedVendorId && !hidePrint ? `${basePath}/print?vendorId=${selectedVendorId}` : null;

  return (
    <ReportFilterShell activeCount={selectedVendorId ? 1 : 0} shareButton={shareButton} printHref={printHref} defaultOpen={!selectedVendorId}>
      <div className="min-w-0 max-w-full">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Vendor
        </label>
        <select
          value={selectedVendorId ?? ""}
          onChange={(e) => filter.update((p, key) => (e.target.value ? p.set(key("vendorId"), e.target.value) : p.delete(key("vendorId"))))}
          className="block max-w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a vendor...</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
    </ReportFilterShell>
  );
}
