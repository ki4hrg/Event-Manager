import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveShareLink, recordShareLinkAccess, resolveSharedBoolean } from "@/lib/shareLinks";
import { getEquipmentResponsibilityData } from "@/app/events/reports/actions";
import { getVendorHandoffData, getOrderAssignedVendors, getEventProfileData, getEventScheduleData, getRoomScheduleData, getFunctionDetailData, getFunctionPickerOptions, getBreakoutScheduleData, getBreakoutGroupOptions, getPackingListData } from "@/app/events/reports/actions";
import { stripUpdatedBy } from "@/lib/stripUpdatedBy";
import { getOptionsForTenant } from "@/lib/options";
import { getEvent } from "@/app/events/actions";
import { EquipmentResponsibilityReport } from "@/app/events/[id]/reports/equipment-responsibility/EquipmentResponsibilityReport";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "@/app/events/[id]/reports/event-profile/EventProfileReport";
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
import { getEsgData } from "@/app/events/reports/actions";
import { EsgReport } from "@/app/events/[id]/reports/esg/EsgReport";
import { ReportFilters as EsgReportFilters } from "@/app/events/[id]/reports/esg/ReportFilters";
import { esgFiltersToQuery, resolveSharedEsgFilters } from "@/lib/esg/params";
import { AVAILABLE_ESG_PARTS } from "@/lib/esg/types";
import { getPostEventReportData } from "@/app/events/reports/actions";
import { PostEventReport } from "@/app/events/[id]/reports/post-event/PostEventReport";
import { ReportFilters as PerReportFilters } from "@/app/events/[id]/reports/post-event/ReportFilters";
import { getHotelInfoReportData } from "@/app/events/reports/actions";
import { HotelInfoReport } from "@/app/events/[id]/reports/hotel-info/HotelInfoReport";
import { parseBlockTypes } from "@/lib/hotels";
import { ReportFilters as HiReportFilters } from "@/app/events/[id]/reports/hotel-info/ReportFilters";
import { ShareShell } from "./ShareShell";
import type { ShareLinkFilters } from "@/lib/shareLinks";

function intersect(input: string[] | undefined, valid: Set<string>): string[] | undefined {
  if (!input) return undefined;
  const filtered = input.filter((id) => valid.has(id));
  return filtered.length > 0 ? filtered : undefined;
}

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  return { title: { absolute: `${reportName} · ${link.event.name}` } };
}

function getString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function SharePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const link = await getActiveShareLink(token);
  if (!link) notFound();

  recordShareLinkAccess(link.id);

  const storedFilters = (link.filters ?? {}) as ShareLinkFilters;
  const printBase = `/share/${token}/print`;

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

    const vendors = link.filtersLocked ? null : await getOrderAssignedVendors(link.eventId);
    if (!link.filtersLocked && vendors) {
      effectiveVendorIds = intersect(effectiveVendorIds, new Set(vendors.map((v) => v.id)));
      effectiveModelTypes = intersect(effectiveModelTypes, new Set(MODEL_TYPES.map((m) => m.value)));
    }

    const groups = await getEquipmentResponsibilityData(link.eventId, {
      vendorIds: effectiveVendorIds,
      modelTypes: effectiveModelTypes,
    });

    const printParams = new URLSearchParams();
    if (effectiveVendorIds?.length) printParams.set("vendors", effectiveVendorIds.join(","));
    if (effectiveModelTypes?.length) printParams.set("models", effectiveModelTypes.join(","));
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Equipment Responsibility"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && vendors && vendors.length > 0 && (
          <EqReportFilters
            eventId={link.eventId}
            vendors={vendors}
            selectedVendorIds={effectiveVendorIds ?? []}
            selectedModelTypes={effectiveModelTypes ?? []}
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <EquipmentResponsibilityReport groups={groups} />
      </ShareShell>
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

    const [event, vendors, functionTypes] = await Promise.all([
      getEvent(link.eventId).then(stripUpdatedBy),
      link.filtersLocked ? Promise.resolve(null) : getOrderAssignedVendors(link.eventId),
      getOptionsForTenant(link.event.tenantId, "function_type"),
    ]);

    if (!event) notFound();

    if (!link.filtersLocked && vendors && effectiveVendorId) {
      const validIds = new Set(vendors.map((v) => v.id));
      if (!validIds.has(effectiveVendorId)) effectiveVendorId = null;
    }

    const handoffData = effectiveVendorId ? stripUpdatedBy(await getVendorHandoffData(link.eventId, effectiveVendorId)) : null;

    const printHref = effectiveVendorId
      ? `${printBase}?vendorId=${effectiveVendorId}`
      : printBase;

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Vendor Handoff"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && vendors && (
          <VhReportFilters
            eventId={link.eventId}
            vendors={vendors}
            selectedVendorId={effectiveVendorId}
            basePath={`/share/${token}`}
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
      </ShareShell>
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

    const event = stripUpdatedBy(await getEvent(link.eventId));
    if (!event) notFound();

    const [data, serviceStyles, scheduleTypes] = await Promise.all([
      getEventProfileData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        types: effectiveTypes && effectiveTypes.length > 0 ? effectiveTypes : undefined,
      }).then(stripUpdatedBy),
      getOptionsForTenant(link.event.tenantId, "service_style"),
      getOptionsForTenant(link.event.tenantId, "schedule_type"),
    ]);

    if (!data) notFound();

    const dayOptions = enumerateEventDays(
      event.startDate,
      event.endDate,
      event.timezone,
      data.availableDayKeys
    );
    if (!link.filtersLocked) {
      effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
      effectiveTypes = intersect(effectiveTypes, new Set(scheduleTypes.map((t) => t.label)));
    }

    const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
    const validSections = (effectiveSections ?? []).filter((s) =>
      validSectionValues.has(s as ProfileSection)
    ) as ProfileSection[];

    const typeOptions = scheduleTypes.map((t) => ({ value: t.label, label: t.label }));

    const printParams = new URLSearchParams();
    if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
    if (effectiveSections?.length) printParams.set("sections", effectiveSections.join(","));
    if (effectiveTypes?.length) printParams.set("types", effectiveTypes.join(","));
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Event Profile"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && (
          <EpReportFilters
            eventId={link.eventId}
            days={dayOptions}
            scheduleTypes={typeOptions}
            selectedDays={effectiveDays ?? []}
            selectedSections={effectiveSections ?? []}
            selectedTypes={effectiveTypes ?? []}
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <EventProfileReport
          data={data}
          serviceStyles={serviceStyles}
          scheduleTypes={scheduleTypes}
          selectedSections={validSections}
        />
      </ShareShell>
    );
  }

  if (link.reportType === "EVENT_SCHEDULE") {
    let effectiveTypes: string[] | undefined;
    let effectiveIncludeNonPublic: boolean;

    if (link.filtersLocked) {
      effectiveTypes = storedFilters.types;
    } else {
      const typesParam = getString(sp.types);
      effectiveTypes = typesParam
        ? typesParam.split(",").filter(Boolean)
        : storedFilters.types;
    }
    effectiveIncludeNonPublic = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.includeNonPublic),
      storedFilters.includeNonPublic
    );
    const effectiveCompact = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.compact),
      storedFilters.compact
    );

    const [scheduleTypes, dataRaw] = await Promise.all([
      getOptionsForTenant(link.event.tenantId, "schedule_type"),
      getEventScheduleData(link.eventId, {
        types: effectiveTypes && effectiveTypes.length > 0 ? effectiveTypes : undefined,
        includeNonPublic: effectiveIncludeNonPublic,
      }),
    ]);

    if (!link.filtersLocked) {
      effectiveTypes = intersect(effectiveTypes, new Set(scheduleTypes.map((t) => t.label)));
    }

    const data = stripUpdatedBy(dataRaw);
    if (!data) notFound();

    const typeOptions = scheduleTypes.map((t) => ({ value: t.label, label: t.label }));

    const printParams = new URLSearchParams();
    if (effectiveTypes?.length) printParams.set("types", effectiveTypes.join(","));
    if (effectiveIncludeNonPublic) printParams.set("includeNonPublic", "true");
    if (effectiveCompact) printParams.set("compact", "true");
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Event Schedule"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && (
          <EsReportFilters
            eventId={link.eventId}
            scheduleTypes={typeOptions}
            selectedTypes={effectiveTypes ?? []}
            includeNonPublic={effectiveIncludeNonPublic}
            compact={effectiveCompact}
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <EventScheduleReport
          data={data}
          scheduleTypes={scheduleTypes}
          includeNonPublic={effectiveIncludeNonPublic}
          compact={effectiveCompact}
        />
      </ShareShell>
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

    const event = stripUpdatedBy(await getEvent(link.eventId));
    if (!event) notFound();

    const [data, functionTypes, scheduleTypes] = await Promise.all([
      getRoomScheduleData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        roomIds: effectiveRoomIds && effectiveRoomIds.length > 0 ? effectiveRoomIds : undefined,
      }).then(stripUpdatedBy),
      getOptionsForTenant(link.event.tenantId, "function_type"),
      getOptionsForTenant(link.event.tenantId, "schedule_type"),
    ]);

    if (!data) notFound();

    const dayOptions = enumerateEventDays(
      event.startDate,
      event.endDate,
      event.timezone,
      data.availableDayKeys
    );
    if (!link.filtersLocked) {
      effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
      effectiveRoomIds = intersect(effectiveRoomIds, new Set(data.rooms.map((r) => r.id)));
    }

    const printParams = new URLSearchParams();
    if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
    if (effectiveRoomIds?.length) printParams.set("rooms", effectiveRoomIds.join(","));
    if (effectiveUsedOnly) printParams.set("usedOnly", "true");
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    const roomOptions = data.rooms.map((r) => ({
      value: r.id,
      label: r.venue?.name ? `${r.name} · ${r.venue.name}` : r.name,
      groupId: r.group?.id ?? null,
      groupName: r.group?.name ?? null,
      groupSortOrder: r.group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    }));

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Room Schedule"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && (
          <RsReportFilters
            eventId={link.eventId}
            days={dayOptions}
            rooms={roomOptions}
            selectedDays={effectiveDays ?? []}
            selectedRoomIds={effectiveRoomIds ?? []}
            usedOnly={effectiveUsedOnly}
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <RoomScheduleReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
          usedOnly={effectiveUsedOnly}
        />
      </ShareShell>
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

    const [event, pickerOptions, functionTypes, scheduleTypes, serviceStyles, setupTypes] =
      await Promise.all([
        getEvent(link.eventId).then(stripUpdatedBy),
        link.filtersLocked ? Promise.resolve(null) : getFunctionPickerOptions(link.eventId),
        getOptionsForTenant(link.event.tenantId, "function_type"),
        getOptionsForTenant(link.event.tenantId, "schedule_type"),
        getOptionsForTenant(link.event.tenantId, "service_style"),
        getOptionsForTenant(link.event.tenantId, "setup_type"),
      ]);

    if (!event) notFound();

    if (!link.filtersLocked && pickerOptions) {
      effectiveFunctionIds = intersect(
        effectiveFunctionIds,
        new Set(pickerOptions.map((o) => o.value)),
      );
    }

    const data = stripUpdatedBy(await getFunctionDetailData(link.eventId, {
      functionIds: effectiveFunctionIds,
    }));

    if (!data) notFound();

    const printParams = new URLSearchParams();
    if (effectiveFunctionIds?.length) {
      printParams.set("functions", effectiveFunctionIds.join(","));
    }
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Function Detail"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && pickerOptions && (
          <FdReportFilters
            eventId={link.eventId}
            functions={pickerOptions}
            selectedFunctionIds={effectiveFunctionIds ?? []}
            basePath={`/share/${token}`}
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
      </ShareShell>
    );
  }

  if (link.reportType === "BREAKOUT_GRID" || link.reportType === "BREAKOUT_ASSIGNMENTS") {
    let effectiveGroupIds: string[] | undefined;

    if (link.filtersLocked) {
      effectiveGroupIds = storedFilters.breakoutGroupIds;
    } else {
      const groupsParam = getString(sp.groups);
      effectiveGroupIds = groupsParam
        ? groupsParam.split(",").filter(Boolean)
        : storedFilters.breakoutGroupIds;
    }

    const groupOptions = link.filtersLocked ? null : await getBreakoutGroupOptions(link.eventId);
    if (!link.filtersLocked && groupOptions) {
      effectiveGroupIds = intersect(effectiveGroupIds, new Set(groupOptions.map((g) => g.id)));
    }

    const data = stripUpdatedBy(await getBreakoutScheduleData(link.eventId, {
      groupIds: effectiveGroupIds && effectiveGroupIds.length > 0 ? effectiveGroupIds : undefined,
    }));
    if (!data) notFound();

    const printParams = new URLSearchParams();
    if (effectiveGroupIds?.length) printParams.set("groups", effectiveGroupIds.join(","));
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    const groupChoices = (groupOptions ?? []).map((g) => ({ value: g.id, label: g.name }));
    const isGrid = link.reportType === "BREAKOUT_GRID";

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle={isGrid ? "Breakout Grid" : "Breakout Assignments"}
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && groupOptions && (
          isGrid ? (
            <BgReportFilters
              eventId={link.eventId}
              groups={groupChoices}
              selectedGroupIds={effectiveGroupIds ?? []}
              basePath={`/share/${token}`}
              hidePrint
            />
          ) : (
            <BaReportFilters
              eventId={link.eventId}
              groups={groupChoices}
              selectedGroupIds={effectiveGroupIds ?? []}
              basePath={`/share/${token}`}
              hidePrint
            />
          )
        )}
        {isGrid ? (
          <BreakoutGridReport data={data} />
        ) : (
          <BreakoutAssignmentsReport data={data} />
        )}
      </ShareShell>
    );
  }

  if (link.reportType === "PACKING_LIST") {
    let effectiveRoomIds: string[] | undefined;
    let effectivePackingStatuses: string[] | undefined;
    let effectiveAcquisitionStates: string[] | undefined;
    let effectiveProviders: string[] | undefined;

    if (link.filtersLocked) {
      effectiveRoomIds = storedFilters.rooms;
      effectivePackingStatuses = storedFilters.packingStatuses;
      effectiveAcquisitionStates = storedFilters.acquisitionStates;
      effectiveProviders = storedFilters.providers;
    } else {
      const roomsParam = getString(sp.rooms);
      const packingParam = getString(sp.packing);
      const acquisitionParam = getString(sp.acquisition);
      const providersParam = getString(sp.providers);
      effectiveRoomIds = roomsParam
        ? roomsParam.split(",").filter(Boolean)
        : storedFilters.rooms;
      effectivePackingStatuses = packingParam
        ? packingParam.split(",").filter(Boolean)
        : storedFilters.packingStatuses;
      effectiveAcquisitionStates = acquisitionParam
        ? acquisitionParam.split(",").filter(Boolean)
        : storedFilters.acquisitionStates;
      effectiveProviders = providersParam
        ? providersParam.split(",").filter(Boolean)
        : storedFilters.providers;
    }
    const effectiveHidePacked = resolveSharedBoolean(
      link.filtersLocked,
      getString(sp.hidePacked),
      storedFilters.hidePacked
    );

    const data = stripUpdatedBy(await getPackingListData(link.eventId, {
      rooms: effectiveRoomIds,
      packingStatuses: effectivePackingStatuses,
      acquisitionStates: effectiveAcquisitionStates,
      providers: effectiveProviders,
      hidePacked: effectiveHidePacked,
    }));
    if (!data) notFound();

    if (!link.filtersLocked) {
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
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Packing List"
        label={link.label}
        printHref={printHref}
      >
        {!link.filtersLocked && (
          <PlReportFilters
            eventId={link.eventId}
            rooms={data.roomOptions}
            providers={data.providerOptions}
            selectedRoomIds={effectiveRoomIds ?? []}
            selectedPackingStatuses={effectivePackingStatuses ?? []}
            selectedAcquisitionStates={effectiveAcquisitionStates ?? []}
            selectedProviders={effectiveProviders ?? []}
            hidePacked={effectiveHidePacked}
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <PackingListReport data={data} />
      </ShareShell>
    );
  }

  if (link.reportType === "ESG") {
    const filters = resolveSharedEsgFilters(link.filtersLocked, storedFilters, sp);
    // The ESG document carries no updatedBy fields, so there's nothing to strip.
    const data = await getEsgData(link.eventId, filters);
    if (!data) notFound();
    const qs = esgFiltersToQuery(data.applied);
    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Event Specifications Guide"
        label={link.label}
        printHref={qs ? `${printBase}?${qs}` : printBase}
      >
        {!link.filtersLocked && (
          <EsgReportFilters
            eventId={link.eventId}
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
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <EsgReport doc={data.document} />
      </ShareShell>
    );
  }

  if (link.reportType === "POST_EVENT") {
    const blankParam = getString(sp.blank);
    const showBlank = link.filtersLocked ? storedFilters.showBlank === true : blankParam ? blankParam === "1" : storedFilters.showBlank === true;
    const doc = await getPostEventReportData(link.eventId, { showBlank });
    if (!doc) notFound();
    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Post-Event Report"
        label={link.label}
        printHref={showBlank ? `${printBase}?blank=1` : printBase}
      >
        {!link.filtersLocked && (
          <PerReportFilters eventId={link.eventId} showBlank={showBlank} basePath={`/share/${token}`} hidePrint />
        )}
        <PostEventReport doc={doc} />
      </ShareShell>
    );
  }

  if (link.reportType === "HOTEL_INFO") {
    const param = getString(sp.blockTypes);
    const blockTypes = link.filtersLocked
      ? parseBlockTypes(storedFilters.blockTypes?.join(","))
      : parseBlockTypes(param ?? storedFilters.blockTypes?.join(","));
    const data = await getHotelInfoReportData(link.eventId, { blockTypes });
    if (!data) notFound();
    return (
      <ShareShell
        eventName={link.event.name}
        reportTitle="Hotel Information"
        label={link.label}
        printHref={blockTypes.length ? `${printBase}?blockTypes=${blockTypes.join(",")}` : printBase}
      >
        {!link.filtersLocked && (
          <HiReportFilters eventId={link.eventId} blockTypes={blockTypes} basePath={`/share/${token}`} hidePrint />
        )}
        <HotelInfoReport data={data} />
      </ShareShell>
    );
  }

  notFound();
}
