"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { btnOutlinedXs } from "@/lib/buttonStyles";

type ReportFiltersProps = {
  eventId: string;
  guestTypes: string[];
  guestTypeOptions: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

// One filter (guest types, all when none picked); actions stay visible at every width.
export function ReportFilters({
  eventId,
  guestTypes,
  guestTypeOptions,
  basePath = `/events/${eventId}/reports/hotel-info`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = `${paramPrefix}guestTypes`;

  const toggle = (value: string, on: boolean) => {
    const next = on ? [...guestTypes, value] : guestTypes.filter((t) => t !== value);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length) params.set(key, next.join(","));
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Guests</span>
      {guestTypeOptions.map((t) => (
        <label key={t} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={guestTypes.includes(t)}
            onChange={(e) => toggle(t, e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          {t}
        </label>
      ))}
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
