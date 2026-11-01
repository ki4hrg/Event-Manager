"use server";

import { z } from "zod";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import {
  createTrackCore,
  updateTrackCore,
  deleteTrackCore,
  createPresentationCore,
  updatePresentationCore,
  updatePresentationInstanceCountCore,
  deletePresentationCore,
  deletePresentationsCore,
  bulkUpdatePresentationsCore,
  duplicatePresentationCore,
  addSpeakerCore,
  updateSpeakerCore,
  removeSpeakerCore,
  createAndAddPresentationSpeakerCore,
  reorderSpeakersCore,
  type PresentationUpdateArgs,
  type BulkPresentationUpdates,
} from "./core";
import { assertIds, formId, formInt, formName, formNote, formRequiredId, formTexts, formValue, idList, idSchema, parseArgs, parseWhole } from "@/lib/validation";

// ============================================================================
// Track CRUD (event-scoped)
// ============================================================================

export async function getTracks(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return prisma.presentationTrack.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createTrack(eventId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await createTrackCore(
    eventId,
    {
      name: formName(formData, "name"),
      color: formNote(formData, "color"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function updateTrack(trackId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await updateTrackCore(
    trackId,
    eventId,
    {
      name: formName(formData, "name"),
      color: formNote(formData, "color"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function deleteTrack(trackId: string, eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "DELETE", eventId);
  await deleteTrackCore(trackId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations`);
}

// ============================================================================
// Presentation CRUD
// ============================================================================

export async function getPresentations(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return prisma.presentation.findMany({
    where: { eventId },
    include: {
      track: true,
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      slots: {
        include: {
          function: {
            include: { schedules: { orderBy: { startTime: "asc" } } },
          },
          room: true,
        },
      },
    },
    orderBy: [{ title: "asc" }],
  });
}

export async function getPresentation(id: string) {
  const row = await prisma.presentation.findUnique({
    where: { id },
    include: {
      track: true,
      breakoutGroup: true,
      speakers: {
        include: { contact: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      slots: {
        include: {
          function: {
            include: {
              schedules: { orderBy: { startTime: "asc" } },
              breakoutGroup: true,
            },
          },
          room: true,
          advancerVendor: { select: { id: true, name: true } },
          advancerContact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      advancerVendor: { select: { id: true, name: true } },
      advancerContact: { select: { id: true, firstName: true, lastName: true } },
      avOrderLinks: { include: { avOrder: { select: { id: true, name: true } } } },
      setupOrderLinks: { include: { setupOrder: { select: { id: true, name: true, setupType: true, room: { select: { name: true } } } } } },
      supplyOrderLinks: {
        include: {
          supplyOrder: {
            select: {
              id: true,
              name: true,
              status: true,
              substatus: true,
              notes: true,
              items: { select: { id: true, packingStatus: true } },
              room: { select: { id: true, name: true } },
              providerVendor: { select: { id: true, name: true } },
              providerContact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      mediaDeliverableLinks: {
        include: {
          mediaDeliverable: {
            select: {
              id: true,
              name: true,
              status: true,
              substatus: true,
              notes: true,
              mediaType: true,
              providerVendor: { select: { name: true } },
              providerContact: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      printOrder: { select: { id: true, name: true } },
      event: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("PRESENTATIONS", "VIEW", row.eventId);
  return {
    ...row,
    avOrders: row.avOrderLinks.map((l) => l.avOrder),
    setupOrders: row.setupOrderLinks.map((l) => l.setupOrder),
    supplyOrders: row.supplyOrderLinks.map((l) => l.supplyOrder),
    mediaDeliverables: row.mediaDeliverableLinks.map((l) => l.mediaDeliverable),
  };
}

function speakerIds(formData: FormData): string[] {
  const ids = formTexts(formData, "speakerContactIds", { max: 100 });
  assertIds(...ids);
  return ids;
}

export async function createPresentation(eventId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const presentation = await createPresentationCore(
    eventId,
    {
      title: formValue(formData, "title"),
      description: formNote(formData, "description"),
      trackId: formId(formData, "trackId"),
      schedulingNotes: formNote(formData, "schedulingNotes"),
      internalNotes: formNote(formData, "internalNotes"),
      type: formValue(formData, "type"),
      breakoutGroupId: formId(formData, "breakoutGroupId"),
      instanceCount: formInt(formData, "instanceCount", { min: 1, max: 10_000 }) ?? 1,
      advancerVendorId: formId(formData, "advancerVendorId"),
      advancerContactId: formId(formData, "advancerContactId"),
      // Paired with speakerRoles by position: every entry kept, each an id.
      speakerContactIds: speakerIds(formData),
      speakerRoles: formTexts(formData, "speakerRoles"),
      primarySpeakerId: formId(formData, "primarySpeakerId"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${presentation.id}`);
}

export async function updatePresentationInstanceCount(id: string, eventId: string, count: number) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await updatePresentationInstanceCountCore(id, eventId, parseArgs(z.number().int().min(1).max(10_000), count), session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${id}`);
}

export async function updatePresentation(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);

  const args: PresentationUpdateArgs = {
    title: formValue(formData, "title"),
    description: formNote(formData, "description"),
    trackId: formId(formData, "trackId"),
    schedulingNotes: formNote(formData, "schedulingNotes"),
    internalNotes: formNote(formData, "internalNotes"),
    type: formValue(formData, "type"),
  };
  // Fields the form may leave out: absent leaves what the presentation has.
  if (formData.has("breakoutGroupId")) args.breakoutGroupId = formId(formData, "breakoutGroupId");
  const instanceCount = formInt(formData, "instanceCount", { min: 1, max: 10_000 });
  if (instanceCount !== null) args.instanceCount = instanceCount;
  if (formData.has("advancerVendorId")) args.advancerVendorId = formId(formData, "advancerVendorId");
  if (formData.has("advancerContactId")) args.advancerContactId = formId(formData, "advancerContactId");

  await updatePresentationCore(id, eventId, args, session.user.id);

  revalidatePath(`/events/${eventId}/presentations`);
  revalidatePath(`/events/${eventId}/presentations/${id}`);
  redirect(`/events/${eventId}/presentations/${id}?success=Presentation updated`);
}

export async function deletePresentation(id: string, eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "DELETE", eventId);
  await deletePresentationCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations`);
}

export async function deletePresentations(ids: string[], eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "DELETE", eventId);
  await deletePresentationsCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function bulkUpdatePresentations(
  ids: string[],
  eventId: string,
  updates: BulkPresentationUpdates,
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await bulkUpdatePresentationsCore(parseArgs(idList(5_000), ids), eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/presentations`);
}

export async function duplicatePresentation(id: string, eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const duplicate = await duplicatePresentationCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations`);
  redirect(`/events/${eventId}/presentations/${duplicate.id}`);
}

// ============================================================================
// Speaker CRUD
// ============================================================================

export async function addSpeaker(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await addSpeakerCore(
    presentationId,
    eventId,
    formRequiredId(formData, "contactId", "contact"),
    formNote(formData, "role"),
    formData.get("isPrimary") === "true",
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function updateSpeaker(
  speakerId: string,
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await updateSpeakerCore(
    speakerId,
    presentationId,
    eventId,
    formNote(formData, "role"),
    formData.get("isPrimary") === "true",
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function removeSpeaker(speakerId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await removeSpeakerCore(speakerId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function createAndAddPresentationSpeaker(
  presentationId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await createAndAddPresentationSpeakerCore(
    {
      presentationId,
      eventId,
      firstName: formValue(formData, "firstName"),
      lastName: formValue(formData, "lastName"),
      email: formNote(formData, "email"),
      organization: formNote(formData, "organization"),
      role: formNote(formData, "role"),
      isPrimary: formData.get("isPrimary") === "true",
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function reorderSpeakers(
  presentationId: string,
  eventId: string,
  orderedIds: string[]
) {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  await reorderSpeakersCore(presentationId, eventId, orderedIds, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// ============================================================================
// Contact Search (for speaker selection)
// ============================================================================

export async function searchContacts(query: string) {
  const session = await requirePermission("CONTACTS", "VIEW");
  if (!query || query.length < 2) {
    return [];
  }

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

// ============================================================================
// CSV Import — UI-only (deferred from MCP per plan: requires file upload
// semantics and is not a natural LLM interaction shape).
// ============================================================================

export type ImportDestination =
  | "presentation.title"
  | "presentation.description"
  | "presentation.schedulingNotes"
  | "presentation.internalNotes"
  | "presentation.instanceCount"
  | "contact.fullName"
  | "contact.firstName"
  | "contact.lastName"
  | "contact.email"
  | "skip";

export type ColumnMapping = Record<string, ImportDestination>;

// What the import dialog sends: parsed CSV rows (header → cell) and the
// column mapping. Checked before any row is read.
const IMPORT_DESTINATIONS = [
  "presentation.title",
  "presentation.description",
  "presentation.schedulingNotes",
  "presentation.internalNotes",
  "presentation.instanceCount",
  "contact.fullName",
  "contact.firstName",
  "contact.lastName",
  "contact.email",
  "skip",
] as const satisfies readonly ImportDestination[];
// A ragged row's extra cells arrive as an array under Papa's `__parsed_extra`.
const ImportCell = z.union([z.string().max(100_000), z.array(z.string().max(100_000)).max(1_000)]);
const ImportRowsSchema = z.array(z.record(z.string().max(500), ImportCell)).max(50_000);
const ColumnMappingSchema = z.record(z.string().max(500), z.enum(IMPORT_DESTINATIONS));

function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  const lastName = parts.pop()!;
  return { firstName: parts.join(" "), lastName };
}

export async function importPresentationsFromCSV(
  eventId: string,
  rows: Record<string, string>[],
  mapping: ColumnMapping
): Promise<{ created: number; errors: Array<{ row: number; message: string }> }> {
  const session = await requirePermission("PRESENTATIONS", "WRITE", eventId);
  // Text cells only: a ragged row's extra cells (an array) were never read.
  rows = parseArgs(ImportRowsSchema, rows).map(
    (r) => Object.fromEntries(Object.entries(r).filter((e): e is [string, string] => typeof e[1] === "string")),
  );
  mapping = parseArgs(ColumnMappingSchema, mapping);
  const errors: Array<{ row: number; message: string }> = [];
  let created = 0;

  // Pre-fetch all existing contacts matching emails in this import
  const emailHeaders = Object.entries(mapping)
    .filter(([, dest]) => dest === "contact.email")
    .map(([h]) => h);
  const uniqueEmails = Array.from(
    new Set(rows.flatMap((r) => emailHeaders.map((h) => (r[h] ?? "").trim()).filter(Boolean)))
  );
  const existingContacts = uniqueEmails.length
    ? await prisma.contact.findMany({
        where: { tenantId: session.tenantId, email: { in: uniqueEmails } },
      })
    : [];
  const contactByEmail = new Map(existingContacts.map((c) => [c.email as string, c]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const fields: Record<ImportDestination, string> = {} as Record<ImportDestination, string>;
      const internalNotesEntries: string[] = [];
      for (const [header, dest] of Object.entries(mapping)) {
        if (dest === "skip") continue;
        const val = (row[header] ?? "").trim();
        if (dest === "presentation.internalNotes") {
          if (val) internalNotesEntries.push(`${header}: ${val}`);
        } else {
          fields[dest] = val;
        }
      }
      if (internalNotesEntries.length) {
        fields["presentation.internalNotes"] = internalNotesEntries.join("\n");
      }

      const title = fields["presentation.title"]?.trim();
      if (!title) {
        errors.push({ row: i + 1, message: "Missing title — row skipped" });
        continue;
      }

      // Before any write: a row whose count isn't a whole number is reported,
      // and nothing of it (not even its contact) is created.
      const instanceCountRaw = fields["presentation.instanceCount"]?.trim();
      const instanceCount = instanceCountRaw ? parseWhole(instanceCountRaw, "Instance count", { min: 0, max: 10_000 }) : 1;

      let contactId: string | null = null;
      const email = fields["contact.email"]?.trim() || null;
      let firstName = fields["contact.firstName"]?.trim() || "";
      let lastName = fields["contact.lastName"]?.trim() || "";
      if (fields["contact.fullName"]?.trim()) {
        const split = splitFullName(fields["contact.fullName"]);
        if (!firstName) firstName = split.firstName;
        if (!lastName) lastName = split.lastName;
      }

      if (firstName || lastName || email) {
        let contact = email ? (contactByEmail.get(email) ?? null) : null;
        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              tenantId: session.tenantId,
              firstName: firstName || "Unknown",
              lastName,
              email,
              updatedById: session.user.id,
            },
          });
          if (email) contactByEmail.set(email, contact);
        }
        contactId = contact.id;
      }

      const presentation = await prisma.presentation.create({
        data: {
          eventId,
          title,
          description: fields["presentation.description"]?.trim() || null,
          schedulingNotes: fields["presentation.schedulingNotes"]?.trim() || null,
          internalNotes: fields["presentation.internalNotes"]?.trim() || null,
          instanceCount,
          updatedById: session.user.id,
        },
      });

      if (contactId) {
        await prisma.presentationContact.create({
          data: { presentationId: presentation.id, contactId, isPrimary: true, sortOrder: 0 },
        });
      }

      await autoAssignDefaultWorkflows("presentation", presentation.id, eventId);
      created++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  revalidatePath(`/events/${eventId}/presentations`);
  return { created, errors };
}

export async function getPresentationOptions(eventId: string) {
  await requirePermission("PRESENTATIONS", "VIEW", eventId);
  return prisma.presentation.findMany({
    where: { eventId },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}
