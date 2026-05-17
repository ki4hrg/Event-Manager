import React from "react";
import { notFound } from "next/navigation";
import { getActiveShareLink, recordShareLinkAccess } from "@/lib/shareLinks";
import { getEquipmentResponsibilityData, getVendorHandoffData, getEventProfileData, getRoomScheduleData, getFunctionDetailData, getBreakoutScheduleData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { partyGroupKey } from "@/app/events/reports/report-utils";
import { PrintHeader } from "@/components/print/PrintHeader";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import { EventProfileReport, PROFILE_SECTIONS, resolveScheduleTypeFilter, type ProfileSection } from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { FunctionDetailReport } from "@/app/events/[id]/reports/function-detail/FunctionDetailReport";
import { BreakoutGridReport } from "@/app/events/[id]/reports/breakout-grid/BreakoutGridReport";
import { BreakoutAssignmentsReport } from "@/app/events/[id]/reports/breakout-assignments/BreakoutAssignmentsReport";
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
    let effectiveScheduleTypes: string[] | undefined;
    let scheduleTypesExplicit = false;

    if (link.filtersLocked) {
      effectiveDays = storedFilters.days;
      effectiveSections = storedFilters.sections;
      effectiveScheduleTypes = storedFilters.scheduleTypes;
      scheduleTypesExplicit = storedFilters.scheduleTypes !== undefined;
    } else {
      const daysParam = getString(sp.days);
      const sectionsParam = getString(sp.sections);
      const scheduleTypesParam = getString(sp.scheduleTypes);
      effectiveDays = daysParam
        ? daysParam.split(",").filter(Boolean)
        : storedFilters.days;
      effectiveSections = sectionsParam
        ? sectionsParam.split(",").filter(Boolean)
        : storedFilters.sections;
      scheduleTypesExplicit =
        scheduleTypesParam !== undefined || storedFilters.scheduleTypes !== undefined;
      effectiveScheduleTypes = scheduleTypesParam !== undefined
        ? scheduleTypesParam.split(",").filter(Boolean)
        : storedFilters.scheduleTypes;
    }

    const [event, data, functionTypes, scheduleTypes, serviceStyles] = await Promise.all([
      getEvent(link.eventId),
      getEventProfileData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
      }),
      getOptions("function_type"),
      getOptions("schedule_type"),
      getOptions("service_style"),
    ]);

    if (!event || !data) notFound();

    const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
    const validSections = (effectiveSections ?? []).filter((s) =>
      validSectionValues.has(s as ProfileSection)
    ) as ProfileSection[];

    const selectedScheduleTypes = resolveScheduleTypeFilter(
      scheduleTypes,
      effectiveScheduleTypes,
      scheduleTypesExplicit,
    );

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Event Profile" backHref={backHref} />
        <EventProfileReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
          serviceStyles={serviceStyles}
          selectedSections={validSections}
          selectedScheduleTypes={selectedScheduleTypes}
        />
      </div>
    );
  }

  if (link.reportType === "ROOM_SCHEDULE") {
    let effectiveDays: string[] | undefined;
    let effectiveRoomIds: string[] | undefined;

    if (link.filtersLocked) {
      effectiveDays = storedFilters.days;
      effectiveRoomIds = storedFilters.rooms;
    } else {
      const daysParam = getString(sp.days);
      const roomsParam = getString(sp.rooms);
      effectiveDays = daysParam
        ? daysParam.split(",").filter(Boolean)
        : storedFilters.days;
      effectiveRoomIds = roomsParam
        ? roomsParam.split(",").filter(Boolean)
        : storedFilters.rooms;
    }

    const [event, data, functionTypes, scheduleTypes] = await Promise.all([
      getEvent(link.eventId),
      getRoomScheduleData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        roomIds: effectiveRoomIds && effectiveRoomIds.length > 0 ? effectiveRoomIds : undefined,
      }),
      getOptions("function_type"),
      getOptions("schedule_type"),
    ]);

    if (!event || !data) notFound();

    return (
      <>
        <style>{`@page { margin: 0.5in; }`}</style>
        <div className="p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
          <div className="print:hidden">
            <PrintHeader eventName={link.event.name} title="Room Schedule" backHref={backHref} />
          </div>
          <RoomScheduleReport
            data={data}
            functionTypes={functionTypes}
            scheduleTypes={scheduleTypes}
          />
        </div>
      </>
    );
  }

  if (link.reportType === "FUNCTION_DETAIL") {
    let effectiveFunctionIds: string[] | undefined;

    if (link.filtersLocked) {
      effectiveFunctionIds = storedFilters.functionIds;
    } else {
      const functionsParam = getString(sp.functions);
      effectiveFunctionIds = functionsParam
        ? functionsParam.split(",").filter(Boolean)
        : storedFilters.functionIds;
    }

    const [event, data, functionTypes, scheduleTypes, serviceStyles, setupTypes] =
      await Promise.all([
        getEvent(link.eventId),
        getFunctionDetailData(link.eventId, { functionIds: effectiveFunctionIds }),
        getOptions("function_type"),
        getOptions("schedule_type"),
        getOptions("service_style"),
        getOptions("setup_type"),
      ]);

    if (!event || !data) notFound();

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PrintHeader
          eventName={link.event.name}
          title="Function Detail"
          backHref={backHref}
        />
        <FunctionDetailReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
          serviceStyles={serviceStyles}
          setupTypes={setupTypes}
        />
      </div>
    );
  }

  if (link.reportType === "BREAKOUT_GRID") {
    const effectiveGroupIds = link.filtersLocked
      ? storedFilters.breakoutGroupIds
      : (getString(sp.groups)?.split(",").filter(Boolean) ?? storedFilters.breakoutGroupIds);

    const data = await getBreakoutScheduleData(link.eventId, {
      groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
    });
    if (!data) notFound();

    return (
      <>
        <style>{`@page { size: landscape; margin: 0.5in; }`}</style>
        <div className="p-6 max-w-none mx-auto print:p-0">
          <PrintHeader eventName={link.event.name} title="Breakout Grid" backHref={backHref} />
          <BreakoutGridReport data={data} />
        </div>
      </>
    );
  }

  if (link.reportType === "BREAKOUT_ASSIGNMENTS") {
    const effectiveGroupIds = link.filtersLocked
      ? storedFilters.breakoutGroupIds
      : (getString(sp.groups)?.split(",").filter(Boolean) ?? storedFilters.breakoutGroupIds);

    const data = await getBreakoutScheduleData(link.eventId, {
      groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
    });
    if (!data) notFound();

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <PrintHeader
          eventName={link.event.name}
          title="Breakout Assignments"
          backHref={backHref}
        />
        <BreakoutAssignmentsReport data={data} />
      </div>
    );
  }

  notFound();
}
