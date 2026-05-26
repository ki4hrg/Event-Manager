"use client";

import { useRouter, useSearchParams } from "next/navigation";

type ReportFiltersProps = {
  eventId: string;
  includeNonPublic: boolean;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

export function ReportFilters({
  eventId,
  includeNonPublic,
  basePath = `/events/${eventId}/reports/schedule-by-day`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nonPublicKey = `${paramPrefix}includeNonPublic`;

  function toggleNonPublic() {
    const params = new URLSearchParams(searchParams.toString());
    if (includeNonPublic) {
      params.delete(nonPublicKey);
    } else {
      params.set(nonPublicKey, "true");
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center gap-3">
      <button
        onClick={toggleNonPublic}
        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
          includeNonPublic
            ? "bg-blue-600 border-blue-600 text-white"
            : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
        }`}
      >
        Include non-public
      </button>

      <div className="ml-auto flex items-center gap-3">
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
