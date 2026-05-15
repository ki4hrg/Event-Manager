import React from "react";
import { notFound } from "next/navigation";
import { getActiveShareLink, recordShareLinkAccess } from "@/lib/shareLinks";
import { getEquipmentResponsibilityData, getVendorHandoffData, getEventProfileData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { partyGroupKey } from "@/app/events/reports/report-utils";
import { PrintHeader } from "@/components/print/PrintHeader";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { reportTh as th, reportTd as td, reportGroupRow } from "@/lib/reportStyles";
import type { ShareLinkFilters } from "@/lib/shareLinks";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function SharePrintPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const link = await getActiveShareLink(token);
  if (!link) notFound();

  recordShareLinkAccess(link.id);

  const storedFilters = (link.filters ?? {}) as ShareLinkFilters;
  const backHref = `/share/${token}`;

  if (link.reportType === "EQUIPMENT_RESPONSIBILITY") {
    let effectiveVendorIds: string[] | undefined;
    let effectiveModelTypes: string[] | undefined;

    if (link.filtersLocked) {
      effectiveVendorIds = storedFilters.vendorIds;
      effectiveModelTypes = storedFilters.modelTypes;
    } else {
      const vendorsParam = getString(sp.vendors);
      const modelsParam = getString(sp.models);
      effectiveVendorIds = vendorsParam
        ? vendorsParam.split(",").filter(Boolean)
        : storedFilters.vendorIds;
      effectiveModelTypes = modelsParam
        ? modelsParam.split(",").filter(Boolean)
        : storedFilters.modelTypes;
    }

    const groups = await getEquipmentResponsibilityData(link.eventId, {
      vendorIds: effectiveVendorIds,
      modelTypes: effectiveModelTypes,
    });

    const totalItems = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const hasUnscheduled = groups.some((g) =>
      g.rows.some((r) => r.sources.some((s) => !s.isScheduled))
    );
    const generated = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Equipment Responsibility" backHref={backHref} />

        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">No equipment items found for the selected filters.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className={th}>Category</th>
                <th className={th}>Item</th>
                <th className={`${th} text-right`}>Total Qty</th>
                <th className={`${th} text-right`}>Peak Needed</th>
                <th className={th}>Functions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <React.Fragment key={partyGroupKey(group)}>
                  <tr>
                    <td colSpan={5} className={reportGroupRow}>
                      {group.partyName}
                      {group.partyType === "contact" && (
                        <span className="font-normal text-gray-500 ml-1">(Contact)</span>
                      )}
                    </td>
                  </tr>
                  {group.rows.map((row, i) => (
                    <tr key={`${row.equipmentId ?? row.itemName}-${i}`}>
                      <td className={td}>{row.category ?? ""}</td>
                      <td className={td}>{row.itemName}</td>
                      <td className={`${td} text-right`}>{row.totalQuantity}</td>
                      <td className={`${td} text-right`}>
                        {row.peakIsExact ? String(row.peakNeeded) : `≥${row.peakNeeded}`}
                      </td>
                      <td className={td}>
                        {row.sources
                          .map(
                            (s) =>
                              `${s.functionNames.length > 0 ? s.functionNames.join(", ") : "—"} (${s.quantity})${!s.isScheduled ? " †" : ""}`
                          )
                          .join("; ")}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
          <span>{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
          <span>Generated {generated}</span>
        </div>

        {hasUnscheduled && (
          <p className="mt-2 text-xs text-gray-500">† Unscheduled — peak is a floor estimate</p>
        )}
      </div>
    );
  }

  if (link.reportType === "VENDOR_HANDOFF") {
    let effectiveVendorId: string | null;

    if (link.filtersLocked) {
      effectiveVendorId = storedFilters.vendorId ?? null;
    } else {
      const vendorIdParam = getString(sp.vendorId);
      effectiveVendorId = vendorIdParam ?? storedFilters.vendorId ?? null;
    }

    if (!effectiveVendorId) {
      return (
        <div className="p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={link.event.name} title="Vendor Handoff" backHref={backHref} />
          <p className="text-sm text-gray-500">No vendor selected.</p>
        </div>
      );
    }

    const [event, handoffData, functionTypes] = await Promise.all([
      getEvent(link.eventId),
      getVendorHandoffData(link.eventId, effectiveVendorId),
      getOptions("function_type"),
    ]);

    if (!event) notFound();
    if (!handoffData) notFound();

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PrintHeader
          eventName={link.event.name}
          title={`Vendor Handoff: ${handoffData.vendor.name}`}
          backHref={backHref}
        />
        <VendorHandoffReport data={handoffData} event={event} functionTypes={functionTypes} />
      </div>
    );
  }

  if (link.reportType === "EVENT_PROFILE") {
    let effectiveDays: string[] | undefined;
    let effectiveSections: string[] | undefined;

    if (link.filtersLocked) {
      effectiveDays = storedFilters.days;
      effectiveSections = storedFilters.sections;
    } else {
      const daysParam = getString(sp.days);
      const sectionsParam = getString(sp.sections);
      effectiveDays = daysParam
        ? daysParam.split(",").filter(Boolean)
        : storedFilters.days;
      effectiveSections = sectionsParam
        ? sectionsParam.split(",").filter(Boolean)
        : storedFilters.sections;
    }

    const [event, data, functionTypes, serviceStyles] = await Promise.all([
      getEvent(link.eventId),
      getEventProfileData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
      }),
      getOptions("function_type"),
      getOptions("service_style"),
    ]);

    if (!event || !data) notFound();

    const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
    const validSections = (effectiveSections ?? []).filter((s) =>
      validSectionValues.has(s as ProfileSection)
    ) as ProfileSection[];

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Event Profile" backHref={backHref} />
        <EventProfileReport
          data={data}
          functionTypes={functionTypes}
          serviceStyles={serviceStyles}
          selectedSections={validSections}
        />
      </div>
    );
  }

  notFound();
}
