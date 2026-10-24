"use client";

import { MODEL_TYPES } from "@/app/vendors/model-types";
import { FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type VendorOption = { id: string; name: string };

type ReportFiltersProps = {
  eventId: string;
  vendors: VendorOption[];
  selectedVendorIds: string[];
  selectedModelTypes: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

export function ReportFilters({ eventId, vendors, selectedVendorIds, selectedModelTypes, basePath = `/events/${eventId}/reports/equipment-responsibility`, paramPrefix = "", shareButton, hidePrint = false }: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  return (
    <ReportFilterShell
      activeCount={selectedVendorIds.length + selectedModelTypes.length}
      onClear={() => filter.clear(["vendors", "models"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      {vendors.length > 0 && (
        <FilterGroup label="Vendor">
          {vendors.map((v) => (
            <FilterChip
              key={v.id}
              active={selectedVendorIds.includes(v.id)}
              onClick={() => filter.toggle("vendors", selectedVendorIds, v.id)}
            >
              {v.name}
            </FilterChip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Order Type">
        {MODEL_TYPES.map(({ value, label }) => (
          <FilterChip
            key={value}
            active={selectedModelTypes.includes(value)}
            onClick={() => filter.toggle("models", selectedModelTypes, value)}
          >
            {label}
          </FilterChip>
        ))}
      </FilterGroup>
    </ReportFilterShell>
  );
}
