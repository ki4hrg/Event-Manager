"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { BLOCK_TYPES } from "@/lib/hotels";

type ReportFiltersProps = {
  eventId: string;
  blockTypes: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

// One filter (block types, all when none picked); actions stay visible at every width.
export function ReportFilters({
  eventId,
  blockTypes,
  basePath = `/events/${eventId}/reports/hotel-info`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = `${paramPrefix}blockTypes`;

  const toggle = (value: string, on: boolean) => {
    const next = on ? [...blockTypes, value] : blockTypes.filter((t) => t !== value);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length) params.set(key, next.join(","));
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Block type</span>
      {BLOCK_TYPES.map((t) => (
        <label key={t.value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={blockTypes.includes(t.value)}
            onChange={(e) => toggle(t.value, e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          {t.label}
        </label>
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {shareButton}
        {!hidePrint && (
          <a
            href={`${basePath}/print${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Print / Save PDF
          </a>
        )}
      </div>
    </div>
  );
}
