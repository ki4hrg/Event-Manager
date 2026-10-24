// Presentation Deliverables: a presenter confirms the session's public title
// and description and sends AV needs, media and a handout request. Server-only
// module.
//
// Writes only plain-text columns. AV needs land on the presentation's
// internalNotes; media become a MediaDeliverable linked to the presentation
// and speaker; handouts become an item on the presentation's print order.

import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { getOptionsForEvent } from "@/lib/options";
import { updatePresentationCore } from "@/app/events/presentations/core";
import { createMediaDeliverableCore } from "@/app/events/media-deliverables/core";
import { createPrintItemCore, createPrintOrderCore } from "@/app/events/print-orders/core";
import { PublicFormError } from "./links";
import {
  DELIVERABLES_SECTIONS,
  DELIVERABLES_SECTION_KEYS,
  readFormLinkConfig,
  type DeliverablesBaseline,
  type DeliverablesPayload,
  type FormDiffRow,
  type FormDiffSection,
} from "./meta";
import type { FileTarget, FormApplyContext, FormModule } from "./types";
import { UserFacingError } from "@/lib/userErrors";

const NOTE_MAX = 2000;

function text(formData: FormData, key: string, max: number): string | null {
  const raw = formData.get(key);
  if (raw == null) return null;
  if (typeof raw !== "string") throw new PublicFormError("invalid");
  const value = raw.trim();
  if (value.length > max) throw new PublicFormError("invalid");
  return value || null;
}

// A link to a file the presenter hosts elsewhere. Stored and shown as text,
// never fetched.
function httpLink(value: string | null): string | null {
  if (value == null) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new PublicFormError("invalid");
  }
}

async function parseDeliverables(formData: FormData, sections: string[], baseline: DeliverablesBaseline): Promise<DeliverablesPayload> {
  const on = new Set(sections);
  const payload: DeliverablesPayload = {};
  if (on.has("details")) {
    const title = text(formData, "title", 300);
    if (!title) throw new PublicFormError("invalid");
    payload.title = title;
    payload.description = text(formData, "description", NOTE_MAX);
  }
  if (on.has("av")) payload.avNeeds = text(formData, "avNeeds", NOTE_MAX);
  if (on.has("media")) {
    const mediaType = text(formData, "mediaType", 120);
    if (mediaType !== null && !baseline.mediaTypes.includes(mediaType)) throw new PublicFormError("invalid");
    const link = httpLink(text(formData, "mediaLink", 500));
    const notes = text(formData, "mediaNotes", NOTE_MAX);
    const uploaded = formData.get("mediaUploaded") === "true";
    payload.media = mediaType || link || notes || uploaded ? { mediaType, link, notes, uploaded } : null;
  }
  if (on.has("handouts")) {
    const description = text(formData, "handoutDescription", 300);
    const qty = text(formData, "handoutQuantity", 6);
    if (qty !== null && !/^\d+$/.test(qty)) throw new PublicFormError("invalid");
    payload.handouts = description ? { description, quantity: qty === null ? null : parseInt(qty, 10) } : null;
  }
  return payload;
}

const createRow = (field: string, label: string, proposed: string | null): FormDiffRow => ({
  field,
  label,
  baseline: null,
  proposed,
  current: null,
  status: "changed",
});

function diffDeliverables(
  baseline: DeliverablesBaseline,
  payload: DeliverablesPayload,
  current: DeliverablesBaseline,
  sections: string[],
): FormDiffSection[] {
  return DELIVERABLES_SECTIONS.filter((s) => sections.includes(s.key)).map(({ key, label }) => {
    const base = { key, label, verdict: null, note: null };
    switch (key) {
      case "details": {
        const rows: FormDiffRow[] = (
          [
            ["title", "Title", baseline.title, payload.title, current.title],
            ["description", "Description", baseline.description, payload.description, current.description],
          ] as const
        )
          .filter(([, , , proposed]) => proposed !== undefined)
          .map(([field, label, before, proposed, now]) => ({
            field,
            label,
            baseline: before,
            proposed: proposed ?? null,
            current: now,
            status: (proposed ?? null) === before ? "unchanged" : now !== before ? "conflict" : "changed",
          }));
        return { ...base, mode: "update" as const, rows, applicable: rows.some((r) => r.status !== "unchanged") };
      }
      case "av": {
        const rows = payload.avNeeds ? [createRow("avNeeds", "AV needs", payload.avNeeds)] : [];
        return { ...base, mode: "create" as const, rows, applicable: rows.length > 0 };
      }
      case "media": {
        const m = payload.media;
        const rows = m
          ? [
              createRow("mediaType", "Type", m.mediaType),
              createRow("uploaded", "Uploaded to your folder", m.uploaded ? "Yes" : null),
              createRow("link", "Link", m.link),
              createRow("notes", "Notes", m.notes),
            ].filter((r) => r.proposed)
          : [];
        // Files alone still make a deliverable worth creating.
        return { ...base, mode: "create" as const, rows, applicable: true };
      }
      case "handouts": {
        const h = payload.handouts;
        const rows = h ? [createRow("handout", "Handout", h.quantity != null ? `${h.quantity} × ${h.description}` : h.description)] : [];
        return { ...base, mode: "create" as const, rows, applicable: rows.length > 0 };
      }
      default: {
        const _exhaustive: never = key;
        throw new Error(`Unhandled section: ${_exhaustive}`);
      }
    }
  });
}

async function snapshotDeliverables(presentationId: string, contactId: string | null, eventId: string) {
  const [p, contact, mediaTypes] = await Promise.all([
    prisma.presentation.findFirst({
      where: { id: presentationId, eventId },
      select: { title: true, description: true, updatedAt: true },
    }),
    contactId ? prisma.contact.findUnique({ where: { id: contactId }, select: { firstName: true, lastName: true } }) : null,
    getOptionsForEvent(eventId, "media_type"),
  ]);
  if (!p) return null;
  return {
    baseline: {
      title: p.title,
      description: p.description,
      speakerName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null,
      mediaTypes: mediaTypes.map((o) => o.label),
    } satisfies DeliverablesBaseline,
    version: p.updatedAt.toISOString(),
  };
}

async function applyDeliverables(ctx: FormApplyContext<DeliverablesPayload, DeliverablesBaseline>) {
  const { link, sections, userId } = ctx;
  const { payload, baseline } = ctx.submission;
  const eventId = link.eventId;
  const presentationId = link.presentationId;
  if (!presentationId) throw new Error("This form's presentation no longer exists");
  const who = baseline.speakerName || ctx.submission.submitterName || "Presenter";
  const timezone = link.event.timezone || "America/Chicago";
  const date = ctx.submission.submittedAt.toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
  const applied: string[] = [];
  let filesTo: FileTarget | undefined;

  const titleChanged = sections.has("details") && payload.title !== undefined && payload.title !== baseline.title;
  const descriptionChanged = sections.has("details") && payload.description !== undefined && (payload.description ?? null) !== baseline.description;
  const av = sections.has("av") ? payload.avNeeds : null;
  if (titleChanged || descriptionChanged || av) {
    // updatePresentationCore writes the whole row: start from what's on file
    // and change only what the presenter changed.
    const current = await prisma.presentation.findFirst({
      where: { id: presentationId, eventId },
      select: { title: true, type: true, description: true, trackId: true, schedulingNotes: true, internalNotes: true },
    });
    if (!current) throw new PermissionError("NOT_FOUND", "The presentation no longer exists");
    await updatePresentationCore(
      presentationId,
      eventId,
      {
        ...current,
        title: titleChanged ? payload.title! : current.title,
        description: descriptionChanged ? payload.description ?? null : current.description,
        internalNotes: av ? [current.internalNotes, `AV needs from ${who} (${date}):\n${av}`].filter(Boolean).join("\n\n") : current.internalNotes,
      },
      userId,
    );
    if (titleChanged || descriptionChanged) applied.push("details");
    if (av) applied.push("av");
  }

  if (sections.has("media") && (payload.media || ctx.submission.fileCount > 0)) {
    const m = payload.media;
    const deliverable = await createMediaDeliverableCore(
      eventId,
      {
        name: `${who} — ${m?.mediaType ?? "Media"}`,
        mediaType: m?.mediaType ?? null,
        description: null,
        delivery: null,
        notes:
          [
            m?.uploaded ? `Uploaded to ${readFormLinkConfig(link.config, DELIVERABLES_SECTION_KEYS).mediaUploadUrl ?? "the shared folder"}` : null,
            m?.link ? `Link: ${m.link}` : null,
            m?.notes,
          ]
            .filter(Boolean)
            .join("\n") || null,
        providerVendorId: null,
        providerContactId: null,
        functionIds: [],
        presentationIds: [presentationId],
        contacts: link.contactId ? [{ contactId: link.contactId, role: null }] : [],
      },
      userId,
    );
    filesTo = { entityType: "mediaDeliverable", entityId: deliverable.id };
    applied.push("media");
  }

  if (sections.has("handouts") && payload.handouts) {
    // A presentation has at most one print order (presentationId is unique).
    const existing = await prisma.printOrder.findFirst({ where: { presentationId, eventId }, select: { id: true } });
    const orderId =
      existing?.id ??
      (
        await createPrintOrderCore(
          eventId,
          { name: `Handouts — ${payload.title ?? baseline.title}`, notes: null, roomId: null, specificLocation: null, functionId: null, presentationId, vendorId: null },
          userId,
        )
      ).id;
    await createPrintItemCore(
      orderId,
      eventId,
      {
        description: payload.handouts.description,
        quantity: payload.handouts.quantity,
        acquisitionState: "TO_PROCURE",
        packingStatus: "NEEDED",
        distributionMethod: null,
        distributionNotes: null,
        designerVendorId: null,
        designerContactId: null,
        printerVendorId: null,
        printerContactId: null,
        notes: `Requested by ${who} (${date})`,
        sourceLocationId: null,
      },
      userId,
    );
    filesTo ??= { entityType: "printOrder", entityId: orderId };
    applied.push("handouts");
  }

  return { applied, filesTo };
}

export const presentationDeliverablesModule: FormModule<DeliverablesPayload, DeliverablesBaseline> = {
  sectionKeys: DELIVERABLES_SECTION_KEYS,
  open: false,
  externalUpload: true,
  async assertTarget({ eventId, presentationId, contactId }, userId) {
    if (!presentationId) throw new UserFacingError("Pick a presentation");
    await requirePermissionForUser(userId, "PRESENTATIONS", "VIEW", eventId);
    const p = await prisma.presentation.findFirst({ where: { id: presentationId, eventId }, select: { id: true } });
    if (!p) throw new PermissionError("NOT_FOUND", "Presentation not found");
    // The recipient, when named, must be one of this presentation's speakers.
    if (contactId) {
      const speaker = await prisma.presentationContact.findFirst({ where: { presentationId, contactId }, select: { id: true } });
      if (!speaker) throw new PermissionError("NOT_FOUND", "Speaker not found");
    }
  },
  async snapshot(link) {
    if (!link.presentationId) return null;
    const snap = await snapshotDeliverables(link.presentationId, link.contactId, link.eventId);
    if (!snap) return null;
    return {
      baseline: snap.baseline,
      sections: readFormLinkConfig(link.config, DELIVERABLES_SECTION_KEYS).sections,
      version: snap.version,
      targetName: snap.baseline.title,
    };
  },
  parse: (formData, snapshot) => parseDeliverables(formData, snapshot.sections, snapshot.baseline),
  rebase(payload, oldBaseline, newBaseline) {
    if (!oldBaseline) return payload;
    const next = { ...payload };
    if (next.title === oldBaseline.title) next.title = newBaseline.title;
    if (next.description !== undefined && next.description === oldBaseline.description) next.description = newBaseline.description;
    return next;
  },
  diff: diffDeliverables,
  async reviewChoices() {
    return [];
  },
  apply: applyDeliverables,
};
