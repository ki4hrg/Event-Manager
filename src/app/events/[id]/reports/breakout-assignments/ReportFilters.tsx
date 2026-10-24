"use client";

import { FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type GroupOption = { value: string; label: string };

type ReportFiltersProps = {
  eventId: string;
  groups: GroupOption[];
  selectedGroupIds: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

export function ReportFilters({
  eventId,
  groups,
  selectedGroupIds,
  basePath = `/events/${eventId}/reports/breakout-assignments`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  return (
    <ReportFilterShell
      activeCount={selectedGroupIds.length}
      onClear={() => filter.clear(["groups"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
      collapsible={groups.length > 1}
    >
      {groups.length > 1 && (
        <FilterGroup label="Groups">
          {groups.map((g) => (
            <FilterChip
              key={g.value}
              active={selectedGroupIds.includes(g.value)}
              onClick={() => filter.toggle("groups", selectedGroupIds, g.value)}
            >
              {g.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
    </ReportFilterShell>
  );
}
