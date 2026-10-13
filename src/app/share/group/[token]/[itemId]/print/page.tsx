import type { Metadata } from "next";
import React from "react";
import { notFound } from "next/navigation";
import { getPostEventReportData } from "@/app/events/reports/actions";
import { PostEventReport } from "@/app/events/[id]/reports/post-event/PostEventReport";
import { getEsgData } from "@/app/events/reports/actions";
import { EsgReport } from "@/app/events/[id]/reports/esg/EsgReport";
import { resolveSharedEsgFilters } from "@/lib/esg/params";
import { getActiveShareLinkGroup, resolveSharedBoolean } from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { SHARE_REPORT_LABELS } from "@/lib/shareLinks";
import {
  getEquipmentResponsibilityData,
  getVendorHandoffData,
  getEventProfileData,
  getEventScheduleData,
  getRoomScheduleData,
  getFunctionDetailData,
  getBreakoutScheduleData,
  getPackingListData,
} from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { stripUpdatedBy } from "@/lib/stripUpdatedBy";
import { partyGroupKey } from "@/app/events/reports/report-utils";
import { PrintHeader } from "@/components/print/PrintHeader";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import {
  EventProfileReport,
  PROFILE_SECTIONS,
  type ProfileSection,
} from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { EventScheduleReport } from "@/app/events/[id]/reports/event-schedule/EventScheduleReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { FunctionDetailReport } from "@/app/events/[id]/reports/function-detail/FunctionDetailReport";
import { BreakoutGridPrintView } from "@/app/events/[id]/reports/breakout-grid/BreakoutGridPrintView";
import { BreakoutAssignmentsReport } from "@/app/events/[id]/reports/breakout-assignments/BreakoutAssignmentsReport";
import { PackingListReport } from "@/app/events/[id]/reports/packing-list/PackingListReport";
import { reportTh as th, reportTd as td, reportGroupRow } from "@/lib/reportStyles";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; itemId: string }>;
}): Promise<Metadata> {
  const { token, itemId } = await params;
  const group = await getActiveShareLinkGroup(token);
  if (!group) return { title: "Shared report (print)" };
  const item = group.items.find((i) => i.id === itemId);
  if (!item) return { title: `${group.label ?? "Shared dashboard"} (print)` };
  const itemName = item.label || SHARE_REPORT_LABELS[item.reportType] || "Report";
  return { title: { absolute: `${itemName} · ${group.event.name} (print)` } };
}

type PageProps = {
  params: Promise<{ token: string; itemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function GroupItemPrintPage({ params, searchParams }: PageProps) {
  const { token, itemId } = await params;
  const sp = await searchParams;

  const group = await getActiveShareLinkGroup(token);
  if (!group) notFound();

  const item = group.items.find((i) => i.id === itemId);
  if (!item) notFound();

  const stored = (item.filters ?? {}) as ShareLinkFilters;
  const eventId = group.eventId;
  const eventName = group.event.name;
  const backHref = `/share/group/${token}?tab=${item.id}`;
  const baseTitle = SHARE_REPORT_LABELS[item.reportType] ?? item.reportType;
  const title = item.label || baseTitle;

  switch (item.reportType) {
    case "EQUIPMENT_RESPONSIBILITY": {
      const vendorsParam = getString(sp.vendors);
      const modelsParam = getString(sp.models);
      const vendorIds = item.filtersLocked
        ? stored.vendorIds
        : vendorsParam
          ? vendorsParam.split(",").filter(Boolean)
          : stored.vendorIds;
      const modelTypes = item.filtersLocked
        ? stored.modelTypes
        : modelsParam
          ? modelsParam.split(",").filter(Boolean)
          : stored.modelTypes;

      const groups = await getEquipmentResponsibilityData(eventId, { vendorIds, modelTypes });
      const totalItems = groups.reduce((sum, g) => sum + g.rows.length, 0);
      const hasUnscheduled = groups.some((g) =>
        g.rows.some((r) => r.sources.some((s) => !s.isScheduled)),
      );
      const generated = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />

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
                  {groups.map((g) => (
                    <React.Fragment key={partyGroupKey(g)}>
                      <tr>
                        <td colSpan={5} className={reportGroupRow}>
                          {g.partyName}
                          {g.partyType === "contact" && (
                            <span className="font-normal text-gray-500 ml-1">(Contact)</span>
                          )}
                        </td>
                      </tr>
                      {g.rows.map((row, i) => (
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
                                  `${s.functionNames.length > 0 ? s.functionNames.join(", ") : "—"} (${s.quantity})${!s.isScheduled ? " †" : ""}`,
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
    case "VENDOR_HANDOFF": {
      const vendorIdParam = getString(sp.vendorId);
      const vendorId = item.filtersLocked ? stored.vendorId ?? null : vendorIdParam ?? stored.vendorId ?? null;

      if (!vendorId) {
        return (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            <PrintHeader eventName={eventName} title={title} backHref={backHref} />
            <p className="text-sm text-gray-500">No vendor selected.</p>
          </div>
        );
      }

      const [event, handoffData, functionTypes] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getVendorHandoffData(eventId, vendorId).then(stripUpdatedBy),
        getOptions("function_type"),
      ]);

      if (!event) notFound();
      if (!handoffData) notFound();

      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader
            eventName={eventName}
            title={item.label || `Vendor Handoff: ${handoffData.vendor.name}`}
            backHref={backHref}
          />
          <VendorHandoffReport data={handoffData} event={event} functionTypes={functionTypes} />
        </div>
      );
    }
    case "EVENT_PROFILE": {
      const daysParam = getString(sp.days);
      const sectionsParam = getString(sp.sections);
      const typesParam = getString(sp.types);
      const days = item.filtersLocked
        ? stored.days
        : daysParam
          ? daysParam.split(",").filter(Boolean)
          : stored.days;
      const sections = item.filtersLocked
        ? stored.sections
        : sectionsParam
          ? sectionsParam.split(",").filter(Boolean)
          : stored.sections;
      const types = item.filtersLocked
        ? stored.types
        : typesParam
          ? typesParam.split(",").filter(Boolean)
          : stored.types;

      const [event, data, serviceStyles, scheduleTypes] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getEventProfileData(eventId, {
          days: days && days.length > 0 ? days : undefined,
          types: types && types.length > 0 ? types : undefined,
        }).then(stripUpdatedBy),
        getOptions("service_style"),
        getOptions("schedule_type"),
      ]);

      if (!event || !data) notFound();

      const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
      const validSections = (sections ?? []).filter((s) =>
        validSectionValues.has(s as ProfileSection),
      ) as ProfileSection[];

      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />
          <EventProfileReport
            data={data}
            serviceStyles={serviceStyles}
            scheduleTypes={scheduleTypes}
            selectedSections={validSections}
          />
        </div>
      );
    }
    case "EVENT_SCHEDULE": {
      const typesParam = getString(sp.types);
      const types = item.filtersLocked
        ? stored.types
        : typesParam
          ? typesParam.split(",").filter(Boolean)
          : stored.types;
      const includeNonPublic = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp.includeNonPublic),
        stored.includeNonPublic
      );
      const compact = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp.compact),
        stored.compact
      );

      const [event, data, scheduleTypes] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getEventScheduleData(eventId, {
          types: types && types.length > 0 ? types : undefined,
          includeNonPublic,
        }).then(stripUpdatedBy),
        getOptions("schedule_type"),
      ]);

      if (!event || !data) notFound();

      return (
        <>
          <style>{`@page { margin: 0.5in; }`}</style>
          <div className="p-4 sm:p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
            <div className="print:hidden">
              <PrintHeader eventName={eventName} title={title} backHref={backHref} />
            </div>
            <EventScheduleReport
              data={data}
              scheduleTypes={scheduleTypes}
              includeNonPublic={includeNonPublic}
              compact={compact}
            />
          </div>
        </>
      );
    }
    case "ROOM_SCHEDULE": {
      const daysParam = getString(sp.days);
      const roomsParam = getString(sp.rooms);
      const days = item.filtersLocked
        ? stored.days
        : daysParam
          ? daysParam.split(",").filter(Boolean)
          : stored.days;
      const roomIds = item.filtersLocked
        ? stored.rooms
        : roomsParam
          ? roomsParam.split(",").filter(Boolean)
          : stored.rooms;
      const usedOnly = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp.usedOnly),
        stored.usedOnly
      );

      const [event, data, functionTypes, scheduleTypes] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getRoomScheduleData(eventId, {
          days: days && days.length > 0 ? days : undefined,
          roomIds: roomIds && roomIds.length > 0 ? roomIds : undefined,
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
              <PrintHeader eventName={eventName} title={title} backHref={backHref} />
            </div>
            <RoomScheduleReport
              data={data}
              functionTypes={functionTypes}
              scheduleTypes={scheduleTypes}
              usedOnly={usedOnly}
            />
          </div>
        </>
      );
    }
    case "FUNCTION_DETAIL": {
      const functionsParam = getString(sp.functions);
      const functionIds = item.filtersLocked
        ? stored.functionIds
        : functionsParam
          ? functionsParam.split(",").filter(Boolean)
          : stored.functionIds;

      const [event, data, functionTypes, scheduleTypes, serviceStyles, setupTypes] =
        await Promise.all([
          getEvent(eventId).then(stripUpdatedBy),
          getFunctionDetailData(eventId, { functionIds }).then(stripUpdatedBy),
          getOptions("function_type"),
          getOptions("schedule_type"),
          getOptions("service_style"),
          getOptions("setup_type"),
        ]);

      if (!event || !data) notFound();

      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />
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
    case "BREAKOUT_GRID": {
      const groupsParam = getString(sp.groups);
      const groupIds = item.filtersLocked
        ? stored.breakoutGroupIds
        : groupsParam
          ? groupsParam.split(",").filter(Boolean)
          : stored.breakoutGroupIds;

      const [event, data] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getBreakoutScheduleData(eventId, {
          groupIds: groupIds && groupIds.length > 0 ? groupIds : undefined,
        }).then(stripUpdatedBy),
      ]);

      if (!event || !data) notFound();

      return <BreakoutGridPrintView data={data} eventName={eventName} />;
    }
    case "BREAKOUT_ASSIGNMENTS": {
      const groupsParam = getString(sp.groups);
      const groupIds = item.filtersLocked
        ? stored.breakoutGroupIds
        : groupsParam
          ? groupsParam.split(",").filter(Boolean)
          : stored.breakoutGroupIds;

      const [event, data] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getBreakoutScheduleData(eventId, {
          groupIds: groupIds && groupIds.length > 0 ? groupIds : undefined,
        }).then(stripUpdatedBy),
      ]);

      if (!event || !data) notFound();

      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />
          <BreakoutAssignmentsReport data={data} />
        </div>
      );
    }
    case "PACKING_LIST": {
      const roomsParam = getString(sp.rooms);
      const packingParam = getString(sp.packing);
      const acquisitionParam = getString(sp.acquisition);
      const providersParam = getString(sp.providers);
      const rooms = item.filtersLocked
        ? stored.rooms
        : roomsParam
          ? roomsParam.split(",").filter(Boolean)
          : stored.rooms;
      const packingStatuses = item.filtersLocked
        ? stored.packingStatuses
        : packingParam
          ? packingParam.split(",").filter(Boolean)
          : stored.packingStatuses;
      const acquisitionStates = item.filtersLocked
        ? stored.acquisitionStates
        : acquisitionParam
          ? acquisitionParam.split(",").filter(Boolean)
          : stored.acquisitionStates;
      const providers = item.filtersLocked
        ? stored.providers
        : providersParam
          ? providersParam.split(",").filter(Boolean)
          : stored.providers;
      const hidePacked = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp.hidePacked),
        stored.hidePacked
      );

      const [event, data] = await Promise.all([
        getEvent(eventId).then(stripUpdatedBy),
        getPackingListData(eventId, {
          rooms,
          packingStatuses,
          acquisitionStates,
          providers,
          hidePacked,
        }).then(stripUpdatedBy),
      ]);

      if (!event || !data) notFound();

      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />
          <PackingListReport data={data} />
        </div>
      );
    }
    case "ESG": {
      const data = await getEsgData(eventId, resolveSharedEsgFilters(item.filtersLocked, stored, sp));
      if (!data) notFound();
      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />
          <EsgReport doc={data.document} />
        </div>
      );
    }
    case "POST_EVENT": {
      const showBlank = item.filtersLocked ? stored.showBlank === true : getString(sp.blank) ? getString(sp.blank) === "1" : stored.showBlank === true;
      const doc = await getPostEventReportData(eventId, { showBlank });
      if (!doc) notFound();
      return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <PrintHeader eventName={eventName} title={title} backHref={backHref} />
          <PostEventReport doc={doc} />
        </div>
      );
    }
    default: {
      const _exhaustive: never = item.reportType as never;
      throw new Error(`Unhandled report type: ${_exhaustive}`);
    }
  }
}
