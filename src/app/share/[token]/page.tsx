import { notFound } from "next/navigation";
import { getActiveShareLink, recordShareLinkAccess } from "@/lib/shareLinks";
import { getEquipmentResponsibilityData } from "@/app/events/reports/actions";
import { getVendorHandoffData, getOrderAssignedVendors, getEventProfileData, getRoomScheduleData, getFunctionDetailData, getFunctionPickerOptions } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { EquipmentResponsibilityReport } from "@/app/events/[id]/reports/equipment-responsibility/EquipmentResponsibilityReport";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { FunctionDetailReport } from "@/app/events/[id]/reports/function-detail/FunctionDetailReport";
import { ReportFilters as EqReportFilters } from "@/app/events/[id]/reports/equipment-responsibility/ReportFilters";
import { ReportFilters as VhReportFilters } from "@/app/events/[id]/reports/vendor-handoff/ReportFilters";
import { ReportFilters as EpReportFilters } from "@/app/events/[id]/reports/event-profile/ReportFilters";
import { ReportFilters as RsReportFilters } from "@/app/events/[id]/reports/room-schedule/ReportFilters";
import { ReportFilters as FdReportFilters } from "@/app/events/[id]/reports/function-detail/ReportFilters";
import { enumerateEventDays } from "@/app/events/[id]/reports/event-profile/days";
import { MODEL_TYPES } from "@/app/vendors/model-types";
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
      getEvent(link.eventId),
      link.filtersLocked ? Promise.resolve(null) : getOrderAssignedVendors(link.eventId),
      getOptions("function_type"),
    ]);

    if (!event) notFound();

    if (!link.filtersLocked && vendors && effectiveVendorId) {
      const validIds = new Set(vendors.map((v) => v.id));
      if (!validIds.has(effectiveVendorId)) effectiveVendorId = null;
    }

    const handoffData = effectiveVendorId ? await getVendorHandoffData(link.eventId, effectiveVendorId) : null;

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

    const event = await getEvent(link.eventId);
    if (!event) notFound();

    const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);
    if (!link.filtersLocked) {
      effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
    }

    const [data, functionTypes, serviceStyles] = await Promise.all([
      getEventProfileData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
      }),
      getOptions("function_type"),
      getOptions("service_style"),
    ]);

    if (!data) notFound();

    const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
    const validSections = (effectiveSections ?? []).filter((s) =>
      validSectionValues.has(s as ProfileSection)
    ) as ProfileSection[];

    const printParams = new URLSearchParams();
    if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
    if (effectiveSections?.length) printParams.set("sections", effectiveSections.join(","));
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
            selectedDays={effectiveDays ?? []}
            selectedSections={effectiveSections ?? []}
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <EventProfileReport
          data={data}
          functionTypes={functionTypes}
          serviceStyles={serviceStyles}
          selectedSections={validSections}
        />
      </ShareShell>
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

    const event = await getEvent(link.eventId);
    if (!event) notFound();

    const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);
    if (!link.filtersLocked) {
      effectiveDays = intersect(effectiveDays, new Set(dayOptions.map((d) => d.value)));
    }

    const [data, functionTypes, scheduleTypes] = await Promise.all([
      getRoomScheduleData(link.eventId, {
        days: effectiveDays && effectiveDays.length > 0 ? effectiveDays : undefined,
        roomIds: effectiveRoomIds && effectiveRoomIds.length > 0 ? effectiveRoomIds : undefined,
      }),
      getOptions("function_type"),
      getOptions("schedule_type"),
    ]);

    if (!data) notFound();

    if (!link.filtersLocked) {
      effectiveRoomIds = intersect(effectiveRoomIds, new Set(data.rooms.map((r) => r.id)));
    }

    const printParams = new URLSearchParams();
    if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
    if (effectiveRoomIds?.length) printParams.set("rooms", effectiveRoomIds.join(","));
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
            basePath={`/share/${token}`}
            hidePrint
          />
        )}
        <RoomScheduleReport
          data={data}
          functionTypes={functionTypes}
          scheduleTypes={scheduleTypes}
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
        getEvent(link.eventId),
        link.filtersLocked ? Promise.resolve(null) : getFunctionPickerOptions(link.eventId),
        getOptions("function_type"),
        getOptions("schedule_type"),
        getOptions("service_style"),
        getOptions("setup_type"),
      ]);

    if (!event) notFound();

    if (!link.filtersLocked && pickerOptions) {
      effectiveFunctionIds = intersect(
        effectiveFunctionIds,
        new Set(pickerOptions.map((o) => o.value)),
      );
    }

    const data = await getFunctionDetailData(link.eventId, {
      functionIds: effectiveFunctionIds,
    });

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

  notFound();
}
