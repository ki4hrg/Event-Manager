import { notFound } from "next/navigation";
import {
  getActiveShareLinkGroup,
  recordShareLinkGroupAccess,
} from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { SHARE_REPORT_LABELS } from "@/lib/shareLinks";
import {
  getEquipmentResponsibilityData,
  getVendorHandoffData,
  getOrderAssignedVendors,
  getEventProfileData,
  getRoomScheduleData,
  getFunctionDetailData,
  getFunctionPickerOptions,
  getBreakoutScheduleData,
  getBreakoutGroupOptions,
} from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { EquipmentResponsibilityReport } from "@/app/events/[id]/reports/equipment-responsibility/EquipmentResponsibilityReport";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import {
  EventProfileReport,
  PROFILE_SECTIONS,
  type ProfileSection,
} from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { FunctionDetailReport } from "@/app/events/[id]/reports/function-detail/FunctionDetailReport";
import { BreakoutGridReport } from "@/app/events/[id]/reports/breakout-grid/BreakoutGridReport";
import { BreakoutAssignmentsReport } from "@/app/events/[id]/reports/breakout-assignments/BreakoutAssignmentsReport";
import { ReportFilters as EqReportFilters } from "@/app/events/[id]/reports/equipment-responsibility/ReportFilters";
import { ReportFilters as VhReportFilters } from "@/app/events/[id]/reports/vendor-handoff/ReportFilters";
import { ReportFilters as EpReportFilters } from "@/app/events/[id]/reports/event-profile/ReportFilters";
import { ReportFilters as RsReportFilters } from "@/app/events/[id]/reports/room-schedule/ReportFilters";
import { ReportFilters as FdReportFilters } from "@/app/events/[id]/reports/function-detail/ReportFilters";
import { ReportFilters as BgReportFilters } from "@/app/events/[id]/reports/breakout-grid/ReportFilters";
import { ReportFilters as BaReportFilters } from "@/app/events/[id]/reports/breakout-assignments/ReportFilters";
import { enumerateEventDays } from "@/app/events/[id]/reports/event-profile/days";
import { MODEL_TYPES } from "@/app/vendors/model-types";
import { ShareShell } from "@/app/share/[token]/ShareShell";
import { GroupTabsClient } from "./GroupTabsClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function intersect(input: string[] | undefined, valid: Set<string>): string[] | undefined {
  if (!input) return undefined;
  const filtered = input.filter((id) => valid.has(id));
  return filtered.length > 0 ? filtered : undefined;
}

function itemPrefix(itemId: string): string {
  return `i_${itemId}_`;
}

type GroupItem = {
  id: string;
  reportType: string;
  filters: ShareLinkFilters;
  filtersLocked: boolean;
  label: string | null;
};

type TabPayload = {
  id: string;
  title: string;
  printHref: string;
  body: React.ReactNode;
};

async function renderItem(
  item: GroupItem,
  eventId: string,
  token: string,
  sp: Record<string, string | string[] | undefined>,
): Promise<TabPayload> {
  const prefix = itemPrefix(item.id);
  const stored = item.filters;
  const titleBase = SHARE_REPORT_LABELS[item.reportType] ?? item.reportType;
  const title = item.label || titleBase;
  const printBase = `/share/group/${token}/${item.id}/print`;
  const sharePath = `/share/group/${token}`;

  switch (item.reportType) {
    case "EQUIPMENT_RESPONSIBILITY": {
      let effectiveVendorIds: string[] | undefined;
      let effectiveModelTypes: string[] | undefined;
      if (item.filtersLocked) {
        effectiveVendorIds = stored.vendorIds;
        effectiveModelTypes = stored.modelTypes;
      } else {
        const vendorsParam = getString(sp[`${prefix}vendors`]);
        const modelsParam = getString(sp[`${prefix}models`]);
        effectiveVendorIds = vendorsParam
          ? vendorsParam.split(",").filter(Boolean)
          : stored.vendorIds;
        effectiveModelTypes = modelsParam
          ? modelsParam.split(",").filter(Boolean)
          : stored.modelTypes;
      }

      const vendors = item.filtersLocked
        ? null
        : await getOrderAssignedVendors(eventId);
      if (!item.filtersLocked && vendors) {
        effectiveVendorIds = intersect(effectiveVendorIds, new Set(vendors.map((v) => v.id)));
        effectiveModelTypes = intersect(
          effectiveModelTypes,
          new Set(MODEL_TYPES.map((m) => m.value)),
        );
      }

      const groups = await getEquipmentResponsibilityData(eventId, {
        vendorIds: effectiveVendorIds,
        modelTypes: effectiveModelTypes,
      });

      const printParams = new URLSearchParams();
      if (effectiveVendorIds?.length) printParams.set("vendors", effectiveVendorIds.join(","));
      if (effectiveModelTypes?.length) printParams.set("models", effectiveModelTypes.join(","));
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && vendors && vendors.length > 0 && (
              <EqReportFilters
                eventId={eventId}
                vendors={vendors}
                selectedVendorIds={effectiveVendorIds ?? []}
                selectedModelTypes={effectiveModelTypes ?? []}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <EquipmentResponsibilityReport groups={groups} />
          </>
        ),
      };
    }
    case "VENDOR_HANDOFF": {
      let effectiveVendorId: string | null;
      if (item.filtersLocked) {
        effectiveVendorId = stored.vendorId ?? null;
      } else {
        const vendorIdParam = getString(sp[`${prefix}vendorId`]);
        effectiveVendorId = vendorIdParam ?? stored.vendorId ?? null;
      }

      const [event, vendors, functionTypes] = await Promise.all([
        getEvent(eventId),
        item.filtersLocked ? Promise.resolve(null) : getOrderAssignedVendors(eventId),
        getOptions("function_type"),
      ]);

      if (!event) notFound();

      if (!item.filtersLocked && vendors && effectiveVendorId) {
        const validIds = new Set(vendors.map((v) => v.id));
        if (!validIds.has(effectiveVendorId)) effectiveVendorId = null;
      }

      const handoffData = effectiveVendorId
        ? await getVendorHandoffData(eventId, effectiveVendorId)
        : null;

      const printHref = effectiveVendorId
        ? `${printBase}?vendorId=${effectiveVendorId}`
        : printBase;

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && vendors && (
              <VhReportFilters
                eventId={eventId}
                vendors={vendors}
                selectedVendorId={effectiveVendorId}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            {handoffData ? (
              <VendorHandoffReport
                data={handoffData}
                event={event}
                functionTypes={functionTypes}
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {effectiveVendorId ? "No data found for this vendor." : "Select a vendor to view the handoff report."}
              </p>
            )}
          </>
        ),
      };
    }
    case "EVENT_PROFILE": {
      let effectiveDays: string[] | undefined;
      let effectiveSections: string[] | undefined;
      if (item.filtersLocked) {
        effectiveDays = stored.days;
        effectiveSections = stored.sections;
      } else {
        const daysParam = getString(sp[`${prefix}days`]);
        const sectionsParam = getString(sp[`${prefix}sections`]);
        effectiveDays = daysParam ? daysParam.split(",").filter(Boolean) : stored.days;
        effectiveSections = sectionsParam ? sectionsParam.split(",").filter(Boolean) : stored.sections;
      }

      const event = await getEvent(eventId);
      if (!event) notFound();

      const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);
      if (!item.filtersLocked) {
        effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
      }

      const [data, functionTypes, serviceStyles] = await Promise.all([
        getEventProfileData(eventId, {
          days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        }),
        getOptions("function_type"),
        getOptions("service_style"),
      ]);

      if (!data) notFound();

      const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
      const validSections = (effectiveSections ?? []).filter((s) =>
        validSectionValues.has(s as ProfileSection),
      ) as ProfileSection[];

      const printParams = new URLSearchParams();
      if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
      if (effectiveSections?.length) printParams.set("sections", effectiveSections.join(","));
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && (
              <EpReportFilters
                eventId={eventId}
                days={dayOptions}
                selectedDays={effectiveDays ?? []}
                selectedSections={effectiveSections ?? []}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <EventProfileReport
              data={data}
              functionTypes={functionTypes}
              serviceStyles={serviceStyles}
              selectedSections={validSections}
            />
          </>
        ),
      };
    }
    case "ROOM_SCHEDULE": {
      let effectiveDays: string[] | undefined;
      let effectiveRoomIds: string[] | undefined;
      if (item.filtersLocked) {
        effectiveDays = stored.days;
        effectiveRoomIds = stored.rooms;
      } else {
        const daysParam = getString(sp[`${prefix}days`]);
        const roomsParam = getString(sp[`${prefix}rooms`]);
        effectiveDays = daysParam ? daysParam.split(",").filter(Boolean) : stored.days;
        effectiveRoomIds = roomsParam ? roomsParam.split(",").filter(Boolean) : stored.rooms;
      }

      const event = await getEvent(eventId);
      if (!event) notFound();

      const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);
      if (!item.filtersLocked) {
        effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
      }

      const [data, functionTypes, scheduleTypes] = await Promise.all([
        getRoomScheduleData(eventId, {
          days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
          roomIds:
            effectiveRoomIds && effectiveRoomIds.length > 0 ? effectiveRoomIds : undefined,
        }),
        getOptions("function_type"),
        getOptions("schedule_type"),
      ]);

      if (!data) notFound();

      if (!item.filtersLocked) {
        effectiveRoomIds = intersect(effectiveRoomIds, new Set(data.rooms.map((r) => r.id)));
      }

      const printParams = new URLSearchParams();
      if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
      if (effectiveRoomIds?.length) printParams.set("rooms", effectiveRoomIds.join(","));
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      const roomOptions = data.rooms.map((r) => ({
        value: r.id,
        label: r.venue?.name ? `${r.name} · ${r.venue.name}` : r.name,
        groupId: r.group?.id ?? null,
        groupName: r.group?.name ?? null,
        groupSortOrder: r.group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      }));

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && (
              <RsReportFilters
                eventId={eventId}
                days={dayOptions}
                rooms={roomOptions}
                selectedDays={effectiveDays ?? []}
                selectedRoomIds={effectiveRoomIds ?? []}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <RoomScheduleReport
              data={data}
              functionTypes={functionTypes}
              scheduleTypes={scheduleTypes}
            />
          </>
        ),
      };
    }
    case "FUNCTION_DETAIL": {
      let effectiveFunctionIds: string[] | undefined;
      if (item.filtersLocked) {
        effectiveFunctionIds = stored.functionIds;
      } else {
        const functionsParam = getString(sp[`${prefix}functions`]);
        effectiveFunctionIds = functionsParam
          ? functionsParam.split(",").filter(Boolean)
          : stored.functionIds;
      }

      const [event, pickerOptions, functionTypes, scheduleTypes, serviceStyles, setupTypes] =
        await Promise.all([
          getEvent(eventId),
          item.filtersLocked ? Promise.resolve(null) : getFunctionPickerOptions(eventId),
          getOptions("function_type"),
          getOptions("schedule_type"),
          getOptions("service_style"),
          getOptions("setup_type"),
        ]);

      if (!event) notFound();

      if (!item.filtersLocked && pickerOptions) {
        effectiveFunctionIds = intersect(
          effectiveFunctionIds,
          new Set(pickerOptions.map((o) => o.value)),
        );
      }

      const data = await getFunctionDetailData(eventId, {
        functionIds: effectiveFunctionIds,
      });

      if (!data) notFound();

      const printParams = new URLSearchParams();
      if (effectiveFunctionIds?.length) {
        printParams.set("functions", effectiveFunctionIds.join(","));
      }
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && pickerOptions && (
              <FdReportFilters
                eventId={eventId}
                functions={pickerOptions}
                selectedFunctionIds={effectiveFunctionIds ?? []}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <FunctionDetailReport
              data={data}
              functionTypes={functionTypes}
              scheduleTypes={scheduleTypes}
              serviceStyles={serviceStyles}
              setupTypes={setupTypes}
            />
          </>
        ),
      };
    }
    case "BREAKOUT_GRID":
    case "BREAKOUT_ASSIGNMENTS": {
      const isGrid = item.reportType === "BREAKOUT_GRID";

      let effectiveGroupIds: string[] | undefined;
      if (item.filtersLocked) {
        effectiveGroupIds = stored.breakoutGroupIds;
      } else {
        const groupsParam = getString(sp[`${prefix}groups`]);
        effectiveGroupIds = groupsParam
          ? groupsParam.split(",").filter(Boolean)
          : stored.breakoutGroupIds;
      }

      const groupOptions = item.filtersLocked
        ? null
        : await getBreakoutGroupOptions(eventId);
      if (!item.filtersLocked && groupOptions) {
        effectiveGroupIds = intersect(
          effectiveGroupIds,
          new Set(groupOptions.map((g) => g.id)),
        );
      }

      const data = await getBreakoutScheduleData(eventId, {
        groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
      });

      if (!data) notFound();

      const printParams = new URLSearchParams();
      if (effectiveGroupIds?.length) printParams.set("groups", effectiveGroupIds.join(","));
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      const groupChoices = (groupOptions ?? []).map((g) => ({ value: g.id, label: g.name }));

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && groupOptions && (
              isGrid ? (
                <BgReportFilters
                  eventId={eventId}
                  groups={groupChoices}
                  selectedGroupIds={effectiveGroupIds ?? []}
                  basePath={sharePath}
                  paramPrefix={prefix}
                  hidePrint
                />
              ) : (
                <BaReportFilters
                  eventId={eventId}
                  groups={groupChoices}
                  selectedGroupIds={effectiveGroupIds ?? []}
                  basePath={sharePath}
                  paramPrefix={prefix}
                  hidePrint
                />
              )
            )}
            {isGrid ? (
              <BreakoutGridReport data={data} />
            ) : (
              <BreakoutAssignmentsReport data={data} />
            )}
          </>
        ),
      };
    }
    default: {
      const _exhaustive: never = item.reportType as never;
      throw new Error(`Unhandled report type: ${_exhaustive}`);
    }
  }
}

export default async function GroupSharePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const group = await getActiveShareLinkGroup(token);
  if (!group) notFound();

  recordShareLinkGroupAccess(group.id);

  if (group.items.length === 0) {
    return (
      <ShareShell
        eventName={group.event.name}
        reportTitle={group.label ?? "Dashboard"}
        label={group.label}
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This dashboard has no reports yet.
        </p>
      </ShareShell>
    );
  }

  const tabs = await Promise.all(
    group.items.map((item) =>
      renderItem(
        {
          id: item.id,
          reportType: item.reportType,
          filters: (item.filters ?? {}) as ShareLinkFilters,
          filtersLocked: item.filtersLocked,
          label: item.label,
        },
        group.eventId,
        token,
        sp,
      ),
    ),
  );

  const requested = getString(sp.tab);
  const initialId =
    requested && tabs.some((t) => t.id === requested) ? requested : tabs[0]?.id;

  return (
    <ShareShell
      eventName={group.event.name}
      reportTitle={group.label ?? "Dashboard"}
      label={group.label}
    >
      <GroupTabsClient
        tabs={tabs.map((t) => ({
          id: t.id,
          title: t.title,
          printHref: t.printHref,
        }))}
        initialId={initialId ?? ""}
      >
        {tabs.map((t) => (
          <div key={t.id} data-tab-id={t.id}>
            {t.body}
          </div>
        ))}
      </GroupTabsClient>
    </ShareShell>
  );
}
