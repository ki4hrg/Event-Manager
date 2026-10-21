"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { btnOutlinedXs } from "@/lib/buttonStyles";

type ReportFiltersProps = {
  eventId: string;
  showBlank: boolean;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

// The PER has one view option (blank fields); actions stay visible at every width.
export function ReportFilters({
  eventId,
  showBlank,
  basePath = `/events/${eventId}/reports/post-event`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = `${paramPrefix}blank`;

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={showBlank}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.checked) params.set(key, "1");
            else params.delete(key);
            const qs = params.toString();
            router.push(qs ? `${basePath}?${qs}` : basePath);
          }}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        Show blank fields
      </label>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {shareButton}
        {!hidePrint && (
          <a
            href={`${basePath}/print${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
            className={btnOutlinedXs}
          >
            Print / Save PDF
          </a>
        )}
      </div>
    </div>
  );
}
