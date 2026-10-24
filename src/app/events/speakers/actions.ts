"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEventTenantId, requirePermission } from "@/lib/permissions";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { setContactHeadshotCore, updateContactSpeakerFieldsCore, upsertSpeakerProfileCore } from "./core";

// Speaker profiles for the given contacts at this event, keyed by contact.
export async function getSpeakerProfiles(eventId: string, contactIds: string[]) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  const rows = await prisma.speakerProfile.findMany({ where: { eventId, contactId: { in: contactIds } } });
  return Object.fromEntries(rows.map((r) => [r.contactId, r]));
}

const text = (formData: FormData, key: string) => ((formData.get(key) as string) || "").trim() || null;

export async function updateSpeakerContactFields(eventId: string, presentationId: string, contactId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "VIEW", eventId);
  // Contacts are tenant-wide; the event says which tenant.
  const tenantId = await requireEventTenantId(eventId);
  await updateContactSpeakerFieldsCore(
    contactId,
    {
      bio: text(formData, "bio"),
      pronouns: text(formData, "pronouns"),
      jobTitle: text(formData, "jobTitle"),
      website: text(formData, "website"),
    },
    session.user.id,
    tenantId,
  );
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function removeSpeakerHeadshot(eventId: string, presentationId: string, contactId: string) {
  const session = await requirePermission("PRESENTATIONS", "VIEW", eventId);
  await setContactHeadshotCore(contactId, null, session.user.id, await requireEventTenantId(eventId));
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updateSpeakerProfile(eventId: string, presentationId: string, contactId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  const timezone = event?.timezone || "America/Chicago";
  const when = (key: string) => {
    const v = text(formData, key);
    return v ? parseDateTimeInTimezone(v, timezone) : null;
  };
  await upsertSpeakerProfileCore(
    eventId,
    contactId,
    {
      arrivalAt: when("arrivalAt"),
      departureAt: when("departureAt"),
      travelNotes: text(formData, "travelNotes"),
      hotel: text(formData, "hotel"),
      dietary: text(formData, "dietary"),
      dietaryNeeds: formData.getAll("dietaryNeeds") as string[],
      avNeeds: text(formData, "avNeeds"),
      shirtSize: text(formData, "shirtSize"),
      notes: text(formData, "notes"),
      internalNotes: text(formData, "internalNotes"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}
