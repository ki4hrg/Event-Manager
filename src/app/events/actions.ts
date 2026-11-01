"use server";

import { withUserErrors } from "@/lib/userErrors";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { eventVenuesInclude } from "@/lib/eventVenues";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEventCore,
  updateEventCore,
  deleteEventCore,
  eventScopeWhere,
  addEventKeyStaffCore,
  updateEventKeyStaffCore,
  removeEventKeyStaffCore,
  createContactAndAddKeyStaffCore,
  type EventWriteArgs,
} from "./core";
import { formDate, formId, formIds, formInt, formName, formNote, formRequiredId, formValue, parseArgs } from "@/lib/validation";

// `series`: undefined/"" = all, "__blank__" = events with no series, otherwise a series id.
export async function getEvents(series?: string) {
  const session = await requirePermission("EVENTS", "VIEW");
  const scopeWhere = await eventScopeWhere(session.user.id, session.tenantId);
  const seriesWhere =
    series === "__blank__" ? { seriesId: null } : series ? { seriesId: series } : {};

  return prisma.event.findMany({
    where: { ...scopeWhere, ...seriesWhere },
    include: { ...eventVenuesInclude, series: { select: { id: true, name: true } } },
    orderBy: { startDate: "desc" },
  });
}

export async function getEventSeriesOptions() {
  const session = await requirePermission("EVENTS", "VIEW");
  return prisma.eventSeries.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

function readEventArgs(formData: FormData): EventWriteArgs {
  return {
    name: formName(formData, "name"),
    description: formNote(formData, "description"),
    startDate: formDate(formData, "startDate"),
    endDate: formDate(formData, "endDate"),
    timezone: formValue(formData, "timezone", 100),
    venueIds: formIds(formData, "venueIds"),
    seriesId: formId(formData, "seriesId"),
    isMembershipBased: formData.get("isMembershipBased") === "true",
    // No floor: the form resends a stored count, which may predate these checks.
    membershipCount: formInt(formData, "membershipCount"),
    expectedAttendance: formInt(formData, "expectedAttendance"),
    actualAttendance: formInt(formData, "actualAttendance"),
  };
}


export async function createEvent(formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE");
  return withUserErrors(async () => {
    await createEventCore(readEventArgs(formData), session.user.id, session.tenantId);
    revalidatePath("/events");
    redirect("/events");
  });
}

export async function updateEvent(id: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", id);
  return withUserErrors(async () => {
    await updateEventCore(id, readEventArgs(formData), session.user.id);
    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    redirect(`/events/${id}?success=Event updated`);
  });
}

export async function deleteEvent(id: string) {
  const session = await requirePermission("EVENTS", "DELETE", id);
  await deleteEventCore(id, session.user.id);
  revalidatePath("/events");
  redirect("/events");
}

export async function searchContactsForKeyStaff(query: string) {
  const session = await requirePermission("CONTACTS", "VIEW");
  if (!query || query.length < 2) return [];
  return prisma.contact.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { organization: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function addEventKeyStaff(eventId: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  return withUserErrors(async () => {
    await addEventKeyStaffCore(
      {
        eventId,
        contactId: formRequiredId(formData, "contactId", "contact"),
        title: formNote(formData, "title"),
        models: formData.getAll("models").filter((v): v is string => typeof v === "string"),
        ...keyStaffEsgFromForm(formData),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}`);
  });
}

export async function updateEventKeyStaff(
  keyStaffId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateEventKeyStaffCore(
      {
        keyStaffId,
        eventId,
        title: formNote(formData, "title"),
        models: formData.getAll("models").filter((v): v is string => typeof v === "string"),
        ...keyStaffEsgFromForm(formData),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/specifications`);
  });
}

// Forms that render the ESG controls post `esgFields`; without it (older
// callers) the ESG columns are left alone.
function keyStaffEsgFromForm(formData: FormData) {
  if (!formData.has("esgFields")) return {};
  const onSite = formValue(formData, "onSite");
  return {
    responsibilities: formNote(formData, "responsibilities"),
    onSite: onSite === "true" ? true : onSite === "false" ? false : null,
    isEmergencyContact: formData.get("isEmergencyContact") === "true",
    approvalAuthority: formNote(formData, "approvalAuthority"),
  };
}

export async function removeEventKeyStaff(keyStaffId: string, eventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await removeEventKeyStaffCore(keyStaffId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}`);
}

export async function createContactAndAddKeyStaff(eventId: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  return withUserErrors(async () => {
    await createContactAndAddKeyStaffCore(
      {
        eventId,
        firstName: formValue(formData, "firstName"),
        lastName: formValue(formData, "lastName"),
        email: formNote(formData, "email"),
        organization: formNote(formData, "organization"),
        title: formNote(formData, "title"),
        models: formData.getAll("models").filter((v): v is string => typeof v === "string"),
        ...keyStaffEsgFromForm(formData),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}`);
  });
}

// Where the event looks for hotels and reports by area: whole regions and
// single areas (an RFP may set its own).
export async function updateEventAreas(id: string, scope: { regions: string[]; areas: string[] }) {
  const session = await requirePermission("EVENTS", "WRITE", id);
  const list = z.array(z.string().max(1_000)).max(1_000);
  scope = parseArgs(z.object({ regions: list, areas: list }), scope);
  const clean = (list: string[]) => Array.from(new Set(list.filter(Boolean)));
  await prisma.event.update({ where: { id, tenantId: session.tenantId }, data: { regions: clean(scope.regions), areas: clean(scope.areas), updatedById: session.user.id } });
  revalidatePath(`/events/${id}/settings`);
  revalidatePath(`/events/${id}/hotels`);
}
