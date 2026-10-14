import type { Metadata } from "next";
import React from "react";
import { notFound } from "next/navigation";
import { getActiveShareLink, recordShareLinkAccess, resolveSharedBoolean } from "@/lib/shareLinks";
import { getEquipmentResponsibilityData, getVendorHandoffData, getEventProfileData, getEventScheduleData, getRoomScheduleData, getFunctionDetailData, getBreakoutScheduleData, getPackingListData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { stripUpdatedBy } from "@/lib/stripUpdatedBy";
import { partyGroupKey } from "@/app/events/reports/report-utils";
import { getEsgData } from "@/app/events/reports/actions";
import { EsgReport } from "@/app/events/[id]/reports/esg/EsgReport";
import { resolveSharedEsgFilters } from "@/lib/esg/params";
import { getHotelInfoReportData } from "@/app/events/reports/actions";
import { HotelInfoReport } from "@/app/events/[id]/reports/hotel-info/HotelInfoReport";
import { parseBlockTypes } from "@/lib/hotels";
import { getPostEventReportData } from "@/app/events/reports/actions";
import { PostEventReport } from "@/app/events/[id]/reports/post-event/PostEventReport";
import { PrintHeader } from "@/components/print/PrintHeader";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { EventScheduleReport } from "@/app/events/[id]/reports/event-schedule/EventScheduleReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { FunctionDetailReport } from "@/app/events/[id]/reports/function-detail/FunctionDetailReport";
import { BreakoutGridPrintView } from "@/app/events/[id]/reports/breakout-grid/BreakoutGridPrintView";
import { BreakoutAssignmentsReport } from "@/app/events/[id]/reports/breakout-assignments/BreakoutAssignmentsReport";
import { PackingListReport } from "@/app/events/[id]/reports/packing-list/PackingListReport";
import { reportTh as th, reportTd as td, reportGroupRow } from "@/lib/reportStyles";
import type { ShareLinkFilters } from "@/lib/shareLinks";

export const dynamic = "force-dynamic";

const REPORT_TITLES: Record<string, string> = {
  EQUIPMENT_RESPONSIBILITY: "Equipment responsibility",
  VENDOR_HANDOFF: "Vendor handoff",
  EVENT_PROFILE: "Event profile",
  EVENT_SCHEDULE: "Event schedule",
  ROOM_SCHEDULE: "Room schedule",
  FUNCTION_DETAIL: "Function detail",
  BREAKOUT_GRID: "Breakout grid",
  BREAKOUT_ASSIGNMENTS: "Breakout assignments",
  PACKING_LIST: "Packing list",
  ESG: "Event Specifications Guide",
  POST_EVENT: "Post-Event Report",
  HOTEL_INFO: "Hotel Information",
};

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const link = await getActiveShareLink(token);
  if (!link) return { title: "Shared report" };
  const reportName = REPORT_TITLES[link.reportType] ?? "Shared report";
  return { title: { absolute: `${reportName} · ${link.event.name} (print)` } };
}

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
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Equipment Responsibility" backHref={backHref} />

        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">No equipment items found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
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
          </div>
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
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={link.event.name} title="Vendor Handoff" backHref={backHref} />
          <p className="text-sm text-gray-500">No vendor selected.</p>
        </div>
      );
    }

    const [event, handoffData, functionTypes] = await Promise.all([
      getEvent(link.eventId).then(stripUpdatedBy),
      getVendorHandoffData(link.eventId, effectiveVendorId).then(stripUpdatedBy),
      getOptions("function_type"),
    ]);

    if (!event) notFound();
    if (!handoffData) notFound();

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
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
    let effectiveTypes: string[] | undefined;

    if (link.filtersLocked) {
      effectiveDays = storedFilters.days;
      effectiveSections = storedFilters.sections;
      effectiveTypes = storedFilters.types;
    } else {
      const daysParam = getString(sp.days);
      const sectionsParam = getString(sp.sections);
      const typesParam = getString(sp.types);
      effectiveDays = daysParam
        ? daysParam.split(",").filter(Boolean)
        : storedFilters.days;
      effectiveSections = sectionsParam
        ? sectionsParam.split(",").filter(Boolean)
        : storedFilters.sections;
      effectiveTypes = typesParam
        ? typesParam.split(",").filter(Boolean)
        : storedFilters.types;
    }

    const [event, data, serviceStyles, scheduleTypes] = await Promise.all([
      getEvent(link.eventId).then(stripUpdatedBy),
      getEventProfileData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        types: effectiveTypes && effectiveTypes.length > 0 ? effectiveTypes : undefined,
      }).then(stripUpdatedBy),
      getOptions("service_style"),
      getOptions("schedule_type"),
    ]);

    if (!event || !data) notFound();

    const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
    const validSections = (effectiveSections ?? []).filter((s) =>
      validSectionValues.has(s as ProfileSection)
    ) as ProfileSection[];

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Event Profile" backHref={backHref} />
        <EventProfileReport
          data={data}
          serviceStyles={serviceStyles}
          scheduleTypes={scheduleTypes}
          selectedSections={validSections}
        />
      </div>
    );
  }

  if (link.reportType === "EVENT_SCHEDULE") {
    let effectiveTypes: string[] | undefined;

    if (link.filtersLocked) {
      effectiveTypes = storedFilters.types;
    } else {
      const typesParam = getString(sp.types);
      effectiveTypes = typesParam
        ? typesParam.split(",").filter(Boolean)
        : storedFilters.types;
    }
    const effectiveIncludeNonPublic = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.includeNonPublic),
      storedFilters.includeNonPublic
    );
    const effectiveCompact = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.compact),
      storedFilters.compact
    );

    const [event, data, scheduleTypes] = await Promise.all([
      getEvent(link.eventId).then(stripUpdatedBy),
      getEventScheduleData(link.eventId, {
        types: effectiveTypes && effectiveTypes.length > 0 ? effectiveTypes : undefined,
        includeNonPublic: effectiveIncludeNonPublic,
      }).then(stripUpdatedBy),
      getOptions("schedule_type"),
    ]);

    if (!event || !data) notFound();

    return (
      <>
        <style>{`@page { margin: 0.5in; }`}</style>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
          <div className="print:hidden">
            <PrintHeader eventName={link.event.name} title="Event Schedule" backHref={backHref} />
          </div>
          <EventScheduleReport
            data={data}
            scheduleTypes={scheduleTypes}
            includeNonPublic={effectiveIncludeNonPublic}
            compact={effectiveCompact}
          />
        </div>
      </>
    );
  }

  if (link.reportType === "ROOM_SCHEDULE") {
    let effectiveDays: string[] | undefined;
    let effectiveRoomIds: string[] | undefined;
    let effectiveUsedOnly: boolean;

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
    effectiveUsedOnly = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.usedOnly),
      storedFilters.usedOnly
    );

    const [event, data, functionTypes, scheduleTypes] = await Promise.all([
      getEvent(link.eventId).then(stripUpdatedBy),
      getRoomScheduleData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        roomIds: effectiveRoomIds && effectiveRoomIds.length > 0 ? effectiveRoomIds : undefined,
      }).then(stripUpdatedBy),
      getOptions("function_type"),
      getOptions("schedule_type"),
    ]);

    if (!event || !data) notFound();

    return (
      <>
        <style>{`@page { margin: 0.5in; }`}</style>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
          <div className="print:hidden">
            <PrintHeader eventName={link.event.name} title="Room Schedule" backHref={backHref} />
          </div>
          <RoomScheduleReport
            data={data}
            functionTypes={functionTypes}
            scheduleTypes={scheduleTypes}
            usedOnly={effectiveUsedOnly}
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
        getEvent(link.eventId).then(stripUpdatedBy),
        getFunctionDetailData(link.eventId, { functionIds: effectiveFunctionIds }).then(stripUpdatedBy),
        getOptions("function_type"),
        getOptions("schedule_type"),
        getOptions("service_style"),
        getOptions("setup_type"),
      ]);

    if (!event || !data) notFound();

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
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

    const data = stripUpdatedBy(await getBreakoutScheduleData(link.eventId, {
      groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
    }));
    if (!data) notFound();

    return <BreakoutGridPrintView data={data} eventName={link.event.name} />;
  }

  if (link.reportType === "BREAKOUT_ASSIGNMENTS") {
    const effectiveGroupIds = link.filtersLocked
      ? storedFilters.breakoutGroupIds
      : (getString(sp.groups)?.split(",").filter(Boolean) ?? storedFilters.breakoutGroupIds);

    const data = stripUpdatedBy(await getBreakoutScheduleData(link.eventId, {
      groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
    }));
    if (!data) notFound();

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PrintHeader
          eventName={link.event.name}
          title="Breakout Assignments"
          backHref={backHref}
        />
        <BreakoutAssignmentsReport data={data} />
      </div>
    );
  }

  if (link.reportType === "PACKING_LIST") {
    const roomsParam = getString(sp.rooms);
    const packingParam = getString(sp.packing);
    const acquisitionParam = getString(sp.acquisition);
    const providersParam = getString(sp.providers);
    const rooms = link.filtersLocked
      ? storedFilters.rooms
      : roomsParam
        ? roomsParam.split(",").filter(Boolean)
        : storedFilters.rooms;
    const packingStatuses = link.filtersLocked
      ? storedFilters.packingStatuses
      : packingParam
        ? packingParam.split(",").filter(Boolean)
        : storedFilters.packingStatuses;
    const acquisitionStates = link.filtersLocked
      ? storedFilters.acquisitionStates
      : acquisitionParam
        ? acquisitionParam.split(",").filter(Boolean)
        : storedFilters.acquisitionStates;
    const providers = link.filtersLocked
      ? storedFilters.providers
      : providersParam
        ? providersParam.split(",").filter(Boolean)
        : storedFilters.providers;
    const hidePacked = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.hidePacked),
      storedFilters.hidePacked
    );

    const data = stripUpdatedBy(await getPackingListData(link.eventId, {
      rooms,
      packingStatuses,
      acquisitionStates,
      providers,
      hidePacked,
    }));
    if (!data) notFound();

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Packing List" backHref={backHref} />
        <PackingListReport data={data} />
      </div>
    );
  }

  if (link.reportType === "ESG") {
    const data = await getEsgData(link.eventId, resolveSharedEsgFilters(link.filtersLocked, storedFilters, sp));
    if (!data) notFound();
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Event Specifications Guide" backHref={backHref} />
        <EsgReport doc={data.document} />
      </div>
    );
  }

  if (link.reportType === "POST_EVENT") {
    const blankParam = getString(sp.blank);
    const showBlank = link.filtersLocked ? storedFilters.showBlank === true : blankParam ? blankParam === "1" : storedFilters.showBlank === true;
    const doc = await getPostEventReportData(link.eventId, { showBlank });
    if (!doc) notFound();
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Post-Event Report" backHref={backHref} />
        <PostEventReport doc={doc} />
      </div>
    );
  }

  if (link.reportType === "HOTEL_INFO") {
    const blockTypes = parseBlockTypes(
      link.filtersLocked ? storedFilters.blockTypes?.join(",") : (getString(sp.blockTypes) ?? storedFilters.blockTypes?.join(",")),
    );
    const data = await getHotelInfoReportData(link.eventId, { blockTypes });
    if (!data) notFound();
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <PrintHeader eventName={link.event.name} title="Hotel Information" backHref={backHref} />
        <HotelInfoReport data={data} />
      </div>
    );
  }

  notFound();
}
