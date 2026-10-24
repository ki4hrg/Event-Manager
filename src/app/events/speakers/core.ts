// Pure cores for speaker facts (proposal #55, minimal slice). NOT a
// "use server" file — see src/app/contacts/core.ts for the security rationale.
//
// Two halves, gated at their own scopes: durable facts on Contact ride
// CONTACTS at the tenant; per-event facts on SpeakerProfile ride
// PRESENTATIONS for the event.

import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { rangeTouched } from "@/lib/dateRange";
import { assertEventRefs } from "@/lib/eventRefs";

export type SpeakerContactFields = {
  bio?: string | null;
  pronouns?: string | null;
  jobTitle?: string | null;
  website?: string | null;
};

const CONTACT_KEYS = ["bio", "pronouns", "jobTitle", "website"] as const;

// Writes only the speaker columns — never name, email, phone or organization.
export async function updateContactSpeakerFieldsCore(
  contactId: string,
  args: SpeakerContactFields,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "CONTACTS", "WRITE", { tenantId });
  const data: Record<string, string | null> = {};
  for (const k of CONTACT_KEYS) if (args[k] !== undefined) data[k] = args[k] ?? null;
  return prisma.contact.update({ where: { id: contactId, tenantId }, data: { ...data, updatedById: userId } });
}

// Points the contact's headshot at one of its own files, or clears it.
export async function setContactHeadshotCore(contactId: string, fileId: string | null, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, "CONTACTS", "WRITE", { tenantId });
  if (fileId) {
    const file = await prisma.fileUpload.findFirst({ where: { id: fileId, contactId }, select: { id: true } });
    if (!file) throw new PermissionError("NOT_FOUND", "File not found");
  }
  return prisma.contact.update({ where: { id: contactId, tenantId }, data: { headshotFileId: fileId, updatedById: userId } });
}

export type SpeakerProfileArgs = {
  arrivalAt?: Date | null;
  departureAt?: Date | null;
  travelNotes?: string | null;
  // One of the event's hotel blocks; hotel stays as free text alongside.
  hotelBlockId?: string | null;
  hotel?: string | null;
  dietary?: string | null;
  // dietary_need labels.
  dietaryNeeds?: string[];
  avNeeds?: string | null;
  shirtSize?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
};

const PROFILE_KEYS = [
  "arrivalAt", "departureAt", "travelNotes", "hotelBlockId", "hotel", "dietary", "dietaryNeeds", "avNeeds", "shirtSize", "notes", "internalNotes",
] as const satisfies readonly (keyof SpeakerProfileArgs)[];

// Partial upsert: omitted keys are unchanged. The contact must speak at the
// event — a profile for anyone else is a not-found.
export async function upsertSpeakerProfileCore(eventId: string, contactId: string, args: SpeakerProfileArgs, userId: string) {
  await requirePermissionForUser(userId, "PRESENTATIONS", "WRITE", eventId);
  const speaks = await prisma.presentationContact.findFirst({
    where: { contactId, presentation: { eventId } },
    select: { id: true },
  });
  if (!speaks) throw new PermissionError("NOT_FOUND", "Speaker not found");
  await assertEventRefs(eventId, { hotelBlockIds: [args.hotelBlockId] });
  if (args.arrivalAt !== undefined || args.departureAt !== undefined) {
    // A partial update is checked against the stored other end; a pair the
    // save leaves as stored isn't rechecked (a profile stored reversed still
    // saves its other edits).
    const stored = await prisma.speakerProfile.findUnique({
      where: { eventId_contactId: { eventId, contactId } },
      select: { arrivalAt: true, departureAt: true },
    });
    const arrival = args.arrivalAt !== undefined ? args.arrivalAt : stored?.arrivalAt;
    const departure = args.departureAt !== undefined ? args.departureAt : stored?.departureAt;
    if (arrival && departure && departure < arrival && rangeTouched(stored && { start: stored.arrivalAt, end: stored.departureAt }, arrival, departure)) {
      throw new Error("Departure can't be before arrival");
    }
  }
  const data: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) if (args[k] !== undefined) data[k] = args[k];
  return prisma.speakerProfile.upsert({
    where: { eventId_contactId: { eventId, contactId } },
    create: { eventId, contactId, ...data, updatedById: userId },
    update: { ...data, updatedById: userId },
  });
}
