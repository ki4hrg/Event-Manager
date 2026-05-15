import { notFound } from "next/navigation";
import { getActiveShareLink, recordShareLinkAccess } from "@/lib/shareLinks";
import { getEquipmentResponsibilityData } from "@/app/events/reports/actions";
import { getVendorHandoffData, getOrderAssignedVendors, getEventProfileData, getRoomScheduleData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { getEvent } from "@/app/events/actions";
import { EquipmentResponsibilityReport } from "@/app/events/[id]/reports/equipment-responsibility/EquipmentResponsibilityReport";
import { VendorHandoffReport } from "@/app/events/[id]/reports/vendor-handoff/VendorHandoffReport";
import { EventProfileReport, PROFILE_SECTIONS, type ProfileSection } from "@/app/events/[id]/reports/event-profile/EventProfileReport";
import { RoomScheduleReport } from "@/app/events/[id]/reports/room-schedule/RoomScheduleReport";
import { ReportFilters as EqReportFilters } from "@/app/events/[id]/reports/equipment-responsibility/ReportFilters";
import { ReportFilters as VhReportFilters } from "@/app/events/[id]/reports/vendor-handoff/ReportFilters";
import { ReportFilters as EpReportFilters } from "@/app/events/[id]/reports/event-profile/ReportFilters";
import { ReportFilters as RsReportFilters } from "@/app/events/[id]/reports/room-schedule/ReportFilters";
import { enumerateEventDays } from "@/app/events/[id]/reports/event-profile/days";
import { ShareShell } from "./ShareShell";
import type { ShareLinkFilters } from "@/lib/shareLinks";

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

    const [groups, vendors] = await Promise.all([
      getEquipmentResponsibilityData(link.eventId, {
        vendorIds: effectiveVendorIds,
        modelTypes: effectiveModelTypes,
      }),
      link.filtersLocked ? Promise.resolve(null) : getOrderAssignedVendors(link.eventId),
    ]);

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

    const [event, vendors, handoffData, functionTypes] = await Promise.all([
      getEvent(link.eventId),
      link.filtersLocked ? Promise.resolve(null) : getOrderAssignedVendors(link.eventId),
      effectiveVendorId ? getVendorHandoffData(link.eventId, effectiveVendorId) : Promise.resolve(null),
      getOptions("function_type"),
    ]);

    if (!event) notFound();

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

    const printParams = new URLSearchParams();
    if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
    if (effectiveSections?.length) printParams.set("sections", effectiveSections.join(","));
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);

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

    const printParams = new URLSearchParams();
    if (effectiveDays?.length) printParams.set("days", effectiveDays.join(","));
    if (effectiveRoomIds?.length) printParams.set("rooms", effectiveRoomIds.join(","));
    const printHref = printParams.size > 0 ? `${printBase}?${printParams.toString()}` : printBase;

    const dayOptions = enumerateEventDays(event.startDate, event.endDate, event.timezone);
    const roomOptions = data.rooms.map((r) => ({
      value: r.id,
      label: r.venue?.name ? `${r.name} · ${r.venue.name}` : r.name,
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

  notFound();
}
