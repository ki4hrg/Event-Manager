import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHotelInfoReportData } from "@/app/events/reports/data";
import { HotelInfoReport } from "@/app/events/[id]/reports/hotel-info/HotelInfoReport";
import { hotelInfoGuestTypes } from "@/lib/hotels";
import { ReportFilters as HiReportFilters } from "@/app/events/[id]/reports/hotel-info/ReportFilters";
import { getPostEventReportData } from "@/app/events/reports/data";
import { PostEventReport } from "@/app/events/[id]/reports/post-event/PostEventReport";
import { ReportFilters as PerReportFilters } from "@/app/events/[id]/reports/post-event/ReportFilters";
import { getEsgData } from "@/app/events/reports/data";
import { EsgReport } from "@/app/events/[id]/reports/esg/EsgReport";
import { ReportFilters as EsgReportFilters } from "@/app/events/[id]/reports/esg/ReportFilters";
import { esgFiltersToQuery, resolveSharedEsgFilters } from "@/lib/esg/params";
import { AVAILABLE_ESG_PARTS } from "@/lib/esg/types";
import {
  getActiveShareLinkGroup,
  recordShareLinkGroupAccess,
  resolveSharedBoolean,
} from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { SHARE_REPORT_LABELS } from "@/lib/shareLinks";
import {
  getEquipmentResponsibilityData,
  getVendorHandoffData,
  getOrderAssignedVendors,
  getEventProfileData,
  getEventScheduleData,
  getRoomScheduleData,
  getFunctionDetailData,
  getFunctionPickerOptions,
  getBreakoutScheduleData,
  getBreakoutGroupOptions,
  getPackingListData,
} from "@/app/events/reports/data";
import { getOptionsForEvent } from "@/lib/options";
import { getEvent } from "@/app/events/event";
import { stripUpdatedBy } from "@/lib/stripUpdatedBy";
import { EquipmentResponsibilityReport } from "@/app/events/[id]/reports/equipment-responsibility/EquipmentResponsibilityReport";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import {
  EventProfileReport,
  PROFILE_SECTIONS,
  type ProfileSection,
} from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { EventScheduleReport } from "@/app/events/[id]/reports/event-schedule/EventScheduleReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { FunctionDetailReport } from "@/app/events/[id]/reports/function-detail/FunctionDetailReport";
import { BreakoutGridReport } from "@/app/events/[id]/reports/breakout-grid/BreakoutGridReport";
import { BreakoutAssignmentsReport } from "@/app/events/[id]/reports/breakout-assignments/BreakoutAssignmentsReport";
import { PackingListReport } from "@/app/events/[id]/reports/packing-list/PackingListReport";
import { ReportFilters as PlReportFilters } from "@/app/events/[id]/reports/packing-list/ReportFilters";
import {
  VALID_ACQUISITION_STATES,
  VALID_PACKING_STATUSES,
} from "@/app/events/[id]/reports/packing-list/params";
import { ReportFilters as EqReportFilters } from "@/app/events/[id]/reports/equipment-responsibility/ReportFilters";
import { ReportFilters as VhReportFilters } from "@/app/events/[id]/reports/vendor-handoff/ReportFilters";
import { ReportFilters as EpReportFilters } from "@/app/events/[id]/reports/event-profile/ReportFilters";
import { ReportFilters as EsReportFilters } from "@/app/events/[id]/reports/event-schedule/ReportFilters";
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

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const group = await getActiveShareLinkGroup(token);
  if (!group) return { title: "Shared dashboard" };
  const dashName = group.label || "Shared dashboard";
  return { title: { absolute: `${dashName} · ${group.event.name}` } };
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
        getEvent(eventId).then(stripUpdatedBy),
        item.filtersLocked ? Promise.resolve(null) : getOrderAssignedVendors(eventId),
        getOptionsForEvent(eventId, "function_type"),
      ]);

      if (!event) notFound();

      if (!item.filtersLocked && vendors && effectiveVendorId) {
        const validIds = new Set(vendors.map((v) => v.id));
        if (!validIds.has(effectiveVendorId)) effectiveVendorId = null;
      }

      const handoffData = effectiveVendorId
        ? stripUpdatedBy(await getVendorHandoffData(eventId, effectiveVendorId))
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
      let effectiveTypes: string[] | undefined;
      if (item.filtersLocked) {
        effectiveDays = stored.days;
        effectiveSections = stored.sections;
        effectiveTypes = stored.types;
      } else {
        const daysParam = getString(sp[`${prefix}days`]);
        const sectionsParam = getString(sp[`${prefix}sections`]);
        const typesParam = getString(sp[`${prefix}types`]);
        effectiveDays = daysParam ? daysParam.split(",").filter(Boolean) : stored.days;
        effectiveSections = sectionsParam ? sectionsParam.split(",").filter(Boolean) : stored.sections;
        effectiveTypes = typesParam ? typesParam.split(",").filter(Boolean) : stored.types;
      }

      const event = stripUpdatedBy(await getEvent(eventId));
      if (!event) notFound();

      const [data, serviceStyles, scheduleTypes] = await Promise.all([
        getEventProfileData(eventId, {
          days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
          types: effectiveTypes && effectiveTypes.length > 0 ? effectiveTypes : undefined,
        }).then(stripUpdatedBy),
        getOptionsForEvent(eventId, "service_style"),
        getOptionsForEvent(eventId, "schedule_type"),
      ]);

      if (!data) notFound();

      const dayOptions = enumerateEventDays(
        event.startDate,
        event.endDate,
        event.timezone,
        data.availableDayKeys
      );
      if (!item.filtersLocked) {
        effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
        effectiveTypes = intersect(effectiveTypes, new Set(scheduleTypes.map((t) => t.label)));
      }

      const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
      const validSections = (effectiveSections ?? []).filter((s) =>
        validSectionValues.has(s as ProfileSection),
      ) as ProfileSection[];

      const typeOptions = scheduleTypes.map((t) => ({ value: t.label, label: t.label }));

      const printParams = new URLSearchParams();
      if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
      if (effectiveSections?.length) printParams.set("sections", effectiveSections.join(","));
      if (effectiveTypes?.length) printParams.set("types", effectiveTypes.join(","));
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
                scheduleTypes={typeOptions}
                selectedDays={effectiveDays ?? []}
                selectedSections={effectiveSections ?? []}
                selectedTypes={effectiveTypes ?? []}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <EventProfileReport
              data={data}
              serviceStyles={serviceStyles}
              scheduleTypes={scheduleTypes}
              selectedSections={validSections}
            />
          </>
        ),
      };
    }
    case "EVENT_SCHEDULE": {
      let effectiveTypes: string[] | undefined;
      if (item.filtersLocked) {
        effectiveTypes = stored.types;
      } else {
        const typesParam = getString(sp[`${prefix}types`]);
        effectiveTypes = typesParam
          ? typesParam.split(",").filter(Boolean)
          : stored.types;
      }
      const effectiveIncludeNonPublic = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp[`${prefix}includeNonPublic`]),
        stored.includeNonPublic
      );
      const effectiveCompact = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp[`${prefix}compact`]),
        stored.compact
      );

      const [scheduleTypes, dataRaw] = await Promise.all([
        getOptionsForEvent(eventId, "schedule_type"),
        getEventScheduleData(eventId, {
          types: effectiveTypes && effectiveTypes.length > 0 ? effectiveTypes : undefined,
          includeNonPublic: effectiveIncludeNonPublic,
        }),
      ]);

      if (!item.filtersLocked) {
        effectiveTypes = intersect(effectiveTypes, new Set(scheduleTypes.map((t) => t.label)));
      }

      const data = stripUpdatedBy(dataRaw);
      if (!data) notFound();

      const typeOptions = scheduleTypes.map((t) => ({ value: t.label, label: t.label }));

      const printParams = new URLSearchParams();
      if (effectiveTypes?.length) printParams.set("types", effectiveTypes.join(","));
      if (effectiveIncludeNonPublic) printParams.set("includeNonPublic", "true");
      if (effectiveCompact) printParams.set("compact", "true");
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && (
              <EsReportFilters
                eventId={eventId}
                scheduleTypes={typeOptions}
                selectedTypes={effectiveTypes ?? []}
                includeNonPublic={effectiveIncludeNonPublic}
                compact={effectiveCompact}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <EventScheduleReport
              data={data}
              scheduleTypes={scheduleTypes}
              includeNonPublic={effectiveIncludeNonPublic}
              compact={effectiveCompact}
            />
          </>
        ),
      };
    }
    case "ROOM_SCHEDULE": {
      let effectiveDays: string[] | undefined;
      let effectiveRoomIds: string[] | undefined;
      let effectiveUsedOnly: boolean;
      if (item.filtersLocked) {
        effectiveDays = stored.days;
        effectiveRoomIds = stored.rooms;
      } else {
        const daysParam = getString(sp[`${prefix}days`]);
        const roomsParam = getString(sp[`${prefix}rooms`]);
        effectiveDays = daysParam ? daysParam.split(",").filter(Boolean) : stored.days;
        effectiveRoomIds = roomsParam ? roomsParam.split(",").filter(Boolean) : stored.rooms;
      }
      effectiveUsedOnly = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp[`${prefix}usedOnly`]),
        stored.usedOnly
      );

      const event = stripUpdatedBy(await getEvent(eventId));
      if (!event) notFound();

      const [data, functionTypes, scheduleTypes] = await Promise.all([
        getRoomScheduleData(eventId, {
          days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
          roomIds:
            effectiveRoomIds && effectiveRoomIds.length > 0 ? effectiveRoomIds : undefined,
        }).then(stripUpdatedBy),
        getOptionsForEvent(eventId, "function_type"),
        getOptionsForEvent(eventId, "schedule_type"),
      ]);

      if (!data) notFound();

      const dayOptions = enumerateEventDays(
        event.startDate,
        event.endDate,
        event.timezone,
        data.availableDayKeys
      );
      if (!item.filtersLocked) {
        effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
        effectiveRoomIds = intersect(effectiveRoomIds, new Set(data.rooms.map((r) => r.id)));
      }

      const printParams = new URLSearchParams();
      if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
      if (effectiveRoomIds?.length) printParams.set("rooms", effectiveRoomIds.join(","));
      if (effectiveUsedOnly) printParams.set("usedOnly", "true");
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
                usedOnly={effectiveUsedOnly}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <RoomScheduleReport
              data={data}
              functionTypes={functionTypes}
              scheduleTypes={scheduleTypes}
              usedOnly={effectiveUsedOnly}
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
          getEvent(eventId).then(stripUpdatedBy),
          item.filtersLocked ? Promise.resolve(null) : getFunctionPickerOptions(eventId),
          getOptionsForEvent(eventId, "function_type"),
          getOptionsForEvent(eventId, "schedule_type"),
          getOptionsForEvent(eventId, "service_style"),
          getOptionsForEvent(eventId, "setup_type"),
        ]);

      if (!event) notFound();

      if (!item.filtersLocked && pickerOptions) {
        effectiveFunctionIds = intersect(
          effectiveFunctionIds,
          new Set(pickerOptions.map((o) => o.value)),
        );
      }

      const data = stripUpdatedBy(await getFunctionDetailData(eventId, {
        functionIds: effectiveFunctionIds,
      }));

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

      const data = stripUpdatedBy(await getBreakoutScheduleData(eventId, {
        groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
      }));

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
    case "PACKING_LIST": {
      let effectiveRoomIds: string[] | undefined;
      let effectivePackingStatuses: string[] | undefined;
      let effectiveAcquisitionStates: string[] | undefined;
      let effectiveProviders: string[] | undefined;
      if (item.filtersLocked) {
        effectiveRoomIds = stored.rooms;
        effectivePackingStatuses = stored.packingStatuses;
        effectiveAcquisitionStates = stored.acquisitionStates;
        effectiveProviders = stored.providers;
      } else {
        const roomsParam = getString(sp[`${prefix}rooms`]);
        const packingParam = getString(sp[`${prefix}packing`]);
        const acquisitionParam = getString(sp[`${prefix}acquisition`]);
        const providersParam = getString(sp[`${prefix}providers`]);
        effectiveRoomIds = roomsParam ? roomsParam.split(",").filter(Boolean) : stored.rooms;
        effectivePackingStatuses = packingParam
          ? packingParam.split(",").filter(Boolean)
          : stored.packingStatuses;
        effectiveAcquisitionStates = acquisitionParam
          ? acquisitionParam.split(",").filter(Boolean)
          : stored.acquisitionStates;
        effectiveProviders = providersParam
          ? providersParam.split(",").filter(Boolean)
          : stored.providers;
      }
      const effectiveHidePacked = resolveSharedBoolean(
        item.filtersLocked,
        getString(sp[`${prefix}hidePacked`]),
        stored.hidePacked
      );

      const data = stripUpdatedBy(await getPackingListData(eventId, {
        rooms: effectiveRoomIds,
        packingStatuses: effectivePackingStatuses,
        acquisitionStates: effectiveAcquisitionStates,
        providers: effectiveProviders,
        hidePacked: effectiveHidePacked,
      }));

      if (!data) notFound();

      if (!item.filtersLocked) {
        effectiveRoomIds = intersect(
          effectiveRoomIds,
          new Set(data.roomOptions.map((r) => r.value))
        );
        effectivePackingStatuses = intersect(effectivePackingStatuses, VALID_PACKING_STATUSES);
        effectiveAcquisitionStates = intersect(
          effectiveAcquisitionStates,
          VALID_ACQUISITION_STATES
        );
        effectiveProviders = intersect(
          effectiveProviders,
          new Set(data.providerOptions.map((p) => p.value))
        );
      }

      const printParams = new URLSearchParams();
      if (effectiveRoomIds?.length) printParams.set("rooms", effectiveRoomIds.join(","));
      if (effectivePackingStatuses?.length) {
        printParams.set("packing", effectivePackingStatuses.join(","));
      }
      if (effectiveAcquisitionStates?.length) {
        printParams.set("acquisition", effectiveAcquisitionStates.join(","));
      }
      if (effectiveProviders?.length) printParams.set("providers", effectiveProviders.join(","));
      if (effectiveHidePacked) printParams.set("hidePacked", "true");
      const printHref = printParams.size > 0 ? `${printBase}?${printParams}` : printBase;

      return {
        id: item.id,
        title,
        printHref,
        body: (
          <>
            {!item.filtersLocked && (
              <PlReportFilters
                eventId={eventId}
                rooms={data.roomOptions}
                providers={data.providerOptions}
                selectedRoomIds={effectiveRoomIds ?? []}
                selectedPackingStatuses={effectivePackingStatuses ?? []}
                selectedAcquisitionStates={effectiveAcquisitionStates ?? []}
                selectedProviders={effectiveProviders ?? []}
                hidePacked={effectiveHidePacked}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <PackingListReport data={data} />
          </>
        ),
      };
    }
    case "ESG": {
      const data = await getEsgData(eventId, resolveSharedEsgFilters(item.filtersLocked, stored, sp, prefix));
      if (!data) notFound();
      const qs = esgFiltersToQuery(data.applied);
      return {
        id: item.id,
        title,
        printHref: qs ? `${printBase}?${qs}` : printBase,
        body: (
          <>
            {!item.filtersLocked && (
              <EsgReportFilters
                eventId={eventId}
                timezone={data.document.meta.timezone}
                availableParts={AVAILABLE_ESG_PARTS}
                selectedParts={data.applied.parts.filter((p) => AVAILABLE_ESG_PARTS.includes(p))}
                days={data.dayOptions}
                selectedDays={data.applied.days}
                functions={data.functionOptions}
                selectedFunctionIds={data.applied.functionIds}
                showBlank={data.applied.showBlank}
                includeBilling={data.applied.includeBilling}
                allowBillingToggle={false}
                basePath={sharePath}
                paramPrefix={prefix}
                hidePrint
              />
            )}
            <EsgReport doc={data.document} />
          </>
        ),
      };
    }
    case "POST_EVENT": {
      const blankParam = getString(sp[`${prefix}blank`]);
      const showBlank = item.filtersLocked ? stored.showBlank === true : blankParam ? blankParam === "1" : stored.showBlank === true;
      const doc = await getPostEventReportData(eventId, { showBlank });
      if (!doc) notFound();
      return {
        id: item.id,
        title,
        printHref: showBlank ? `${printBase}?blank=1` : printBase,
        body: (
          <>
            {!item.filtersLocked && (
              <PerReportFilters eventId={eventId} showBlank={showBlank} basePath={sharePath} paramPrefix={prefix} hidePrint />
            )}
            <PostEventReport doc={doc} />
          </>
        ),
      };
    }
    case "HOTEL_INFO": {
      const guestTypes = hotelInfoGuestTypes(item.filtersLocked ? undefined : getString(sp[`${prefix}guestTypes`]), stored);
      const data = await getHotelInfoReportData(eventId, { guestTypes });
      if (!data) notFound();
      return {
        id: item.id,
        title,
        printHref: data.guestTypes.length ? `${printBase}?guestTypes=${encodeURIComponent(data.guestTypes.join(","))}` : printBase,
        body: (
          <>
            {!item.filtersLocked && (
              <HiReportFilters eventId={eventId} guestTypes={data.guestTypes} guestTypeOptions={data.guestTypeOptions} basePath={sharePath} paramPrefix={prefix} hidePrint />
            )}
            <HotelInfoReport data={data} />
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
