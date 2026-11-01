"use server";

import { withUserErrors } from "@/lib/userErrors";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEventTenantId, requirePermission } from "@/lib/permissions";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { blockTypeLabel } from "@/lib/hotels";
import { setContactHeadshotCore, updateContactSpeakerFieldsCore, upsertSpeakerProfileCore } from "./core";
import { formDateTimeKey, formId, formNote, formTexts } from "@/lib/validation";

// Speaker profiles for the given contacts at this event, keyed by contact.
export async function getSpeakerProfiles(eventId: string, contactIds: string[]) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  const rows = await prisma.speakerProfile.findMany({ where: { eventId, contactId: { in: contactIds } } });
  return Object.fromEntries(rows.map((r) => [r.contactId, r]));
}

// The event's hotel blocks as picker options: hotel, then block type.
export async function getSpeakerHotelBlocks(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  const blocks = await prisma.hotelBlock.findMany({
    where: { proposal: { eventId } },
    select: { id: true, contractType: true, guestType: true, proposal: { select: { venue: { select: { name: true } } } } },
    orderBy: [{ isHq: "desc" }, { proposal: { venue: { name: "asc" } } }],
  });
  return blocks.map((b) => ({
    id: b.id,
    label: [b.proposal.venue.name, blockTypeLabel(b.contractType, b.guestType)].filter(Boolean).join(" · "),
  }));
}

const text = (formData: FormData, key: string) => formNote(formData, key);

export async function updateSpeakerContactFields(eventId: string, presentationId: string, contactId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return withUserErrors(async () => {
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
  });
}

export async function removeSpeakerHeadshot(eventId: string, presentationId: string, contactId: string) {
  const session = await requirePermission("PRESENTATIONS", "VIEW", eventId);
  await setContactHeadshotCore(contactId, null, session.user.id, await requireEventTenantId(eventId));
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updateSpeakerProfile(eventId: string, presentationId: string, contactId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: session.tenantId }, select: { timezone: true } });
    const timezone = event?.timezone || "America/Chicago";
    const when = (key: string, label: string) => {
      const v = formDateTimeKey(formData, key, label);
      return v ? parseDateTimeInTimezone(v, timezone) : null;
    };
    await upsertSpeakerProfileCore(
      eventId,
      contactId,
      {
        arrivalAt: when("arrivalAt", "Arrives"),
        departureAt: when("departureAt", "Departs"),
        travelNotes: text(formData, "travelNotes"),
        hotelBlockId: formId(formData, "hotelBlockId"),
        hotel: text(formData, "hotel"),
        dietary: text(formData, "dietary"),
        dietaryNeeds: formTexts(formData, "dietaryNeeds"),
        avNeeds: text(formData, "avNeeds"),
        shirtSize: text(formData, "shirtSize"),
        notes: text(formData, "notes"),
        internalNotes: text(formData, "internalNotes"),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  });
}
