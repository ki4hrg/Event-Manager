"use server";

import { cache } from "react";
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

// No requireAuth() — reused by /share/[token] (see CLAUDE.md share-link carve-out).
export const getEvent = cache(async (id: string) => {
  return prisma.event.findUnique({
    where: { id },
    include: {
      ...eventVenuesInclude,
      updatedBy: { select: { name: true, email: true } },
    },
  });
});

function readEventArgs(formData: FormData): EventWriteArgs {
  return {
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
    startDate: new Date(formData.get("startDate") as string),
    endDate: new Date(formData.get("endDate") as string),
    timezone: (formData.get("timezone") as string) || "America/Chicago",
    venueIds: formData.getAll("venueIds") as string[],
    seriesId: (formData.get("seriesId") as string) || null,
    isMembershipBased: formData.get("isMembershipBased") === "true",
    membershipCount: intOrNull(formData, "membershipCount"),
    expectedAttendance: intOrNull(formData, "expectedAttendance"),
    actualAttendance: intOrNull(formData, "actualAttendance"),
  };
}

function intOrNull(formData: FormData, field: string) {
  return formData.get(field) ? parseInt(formData.get(field) as string) : null;
}

export async function createEvent(formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE");
  await createEventCore(readEventArgs(formData), session.user.id, session.tenantId);
  revalidatePath("/events");
  redirect("/events");
}

export async function updateEvent(id: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", id);
  await updateEventCore(id, readEventArgs(formData), session.user.id);
  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  redirect(`/events/${id}?success=Event updated`);
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
  await addEventKeyStaffCore(
    {
      eventId,
      contactId: formData.get("contactId") as string,
      title: (formData.get("title") as string) || null,
      models: formData.getAll("models") as string[],
      ...keyStaffEsgFromForm(formData),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}`);
}

export async function updateEventKeyStaff(
  keyStaffId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await updateEventKeyStaffCore(
    {
      keyStaffId,
      eventId,
      title: (formData.get("title") as string) || null,
      models: formData.getAll("models") as string[],
      ...keyStaffEsgFromForm(formData),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/specifications`);
}

// Forms that render the ESG controls post `esgFields`; without it (older
// callers) the ESG columns are left alone.
function keyStaffEsgFromForm(formData: FormData) {
  if (!formData.has("esgFields")) return {};
  const onSite = formData.get("onSite") as string;
  return {
    responsibilities: (formData.get("responsibilities") as string) || null,
    onSite: onSite === "true" ? true : onSite === "false" ? false : null,
    isEmergencyContact: formData.get("isEmergencyContact") === "true",
    approvalAuthority: (formData.get("approvalAuthority") as string) || null,
  };
}

export async function removeEventKeyStaff(keyStaffId: string, eventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await removeEventKeyStaffCore(keyStaffId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}`);
}

export async function createContactAndAddKeyStaff(eventId: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await createContactAndAddKeyStaffCore(
    {
      eventId,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: (formData.get("email") as string) || null,
      organization: (formData.get("organization") as string) || null,
      title: (formData.get("title") as string) || null,
      models: formData.getAll("models") as string[],
      ...keyStaffEsgFromForm(formData),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}`);
}
