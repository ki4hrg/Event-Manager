"use client";

import { ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type ReportFiltersProps = {
  eventId: string;
  showBlank: boolean;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

// The PER has one view option (blank fields) and no Clear button.
export function ReportFilters({
  eventId,
  showBlank,
  basePath = `/events/${eventId}/reports/post-event`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  return (
    <ReportFilterShell
      activeCount={showBlank ? 1 : 0}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={showBlank}
          onChange={(e) => filter.setFlag("blank", e.target.checked, "1")}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        Show blank fields
      </label>
    </ReportFilterShell>
  );
}
