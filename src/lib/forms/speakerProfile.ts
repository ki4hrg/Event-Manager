// Speaker Profile: a speaker sends their bio and photo and this event's travel
// and needs. Server-only module.
//
// The one form that updates an existing Contact. It may write only the
// speaker columns (bio, job title, pronouns, website, headshot) of the
// contact staff bound to the link — never name, email, phone or
// organization — and only fields the submitter changed. Bio is plain text.

import { copyFileSync, mkdirSync } from "fs";
import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { HEADSHOT_MIME_TYPES, getUploadDir, getUploadPath } from "@/lib/uploads";
import { setContactHeadshotCore, updateContactSpeakerFieldsCore, upsertSpeakerProfileCore } from "@/app/events/speakers/core";
import { PublicFormError } from "./links";
import {
  SPEAKER_PROFILE_SECTIONS,
  SPEAKER_PROFILE_SECTION_KEYS,
  readFormLinkConfig,
  type FormDiffRow,
  type FormDiffSection,
  type SpeakerProfileBaseline,
  type SpeakerProfilePayload,
} from "./meta";
import type { FormApplyContext, FormModule, ReviewChoice, SubmissionFile } from "./types";

const NOTE_MAX = 2000;

function text(formData: FormData, key: string, max: number): string | null {
  const raw = formData.get(key);
  if (raw == null) return null;
  if (typeof raw !== "string") throw new PublicFormError("invalid");
  const value = raw.trim();
  if (value.length > max) throw new PublicFormError("invalid");
  return value || null;
}

function localDateTime(formData: FormData, key: string): string | null {
  const v = text(formData, key, 16);
  if (v !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new PublicFormError("invalid");
  return v;
}

function website(value: string | null): string | null {
  if (value == null) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new PublicFormError("invalid");
  }
}

function parseSpeakerProfile(formData: FormData, sections: string[]): SpeakerProfilePayload {
  const on = new Set(sections);
  const payload: SpeakerProfilePayload = {};
  if (on.has("bio")) {
    payload.bio = text(formData, "bio", 4000);
    payload.jobTitle = text(formData, "jobTitle", 200);
    payload.pronouns = text(formData, "pronouns", 40);
    payload.website = website(text(formData, "website", 300));
  }
  if (on.has("travel")) {
    payload.arrivalAt = localDateTime(formData, "arrivalAt");
    payload.departureAt = localDateTime(formData, "departureAt");
    payload.hotel = text(formData, "hotel", 200);
    payload.travelNotes = text(formData, "travelNotes", NOTE_MAX);
  }
  if (on.has("needs")) {
    payload.dietary = text(formData, "dietary", NOTE_MAX);
    payload.avNeeds = text(formData, "avNeeds", NOTE_MAX);
    payload.shirtSize = text(formData, "shirtSize", 20);
  }
  return payload;
}

const BIO_FIELDS = [
  ["bio", "Bio"],
  ["jobTitle", "Job title"],
  ["pronouns", "Pronouns"],
  ["website", "Website"],
] as const;

const TRAVEL_FIELDS = [
  ["arrivalAt", "Arrives"],
  ["departureAt", "Departs"],
  ["hotel", "Hotel"],
  ["travelNotes", "Travel notes"],
] as const;

const NEEDS_FIELDS = [
  ["dietary", "Dietary"],
  ["avNeeds", "AV needs"],
  ["shirtSize", "Shirt size"],
] as const;

function changedBio(baseline: SpeakerProfileBaseline, payload: SpeakerProfilePayload) {
  return BIO_FIELDS.filter(([f]) => payload[f] !== undefined && (payload[f] ?? null) !== baseline[f]).map(([f]) => f);
}

function diffSpeakerProfile(
  baseline: SpeakerProfileBaseline,
  payload: SpeakerProfilePayload,
  current: SpeakerProfileBaseline,
  sections: string[],
): FormDiffSection[] {
  return SPEAKER_PROFILE_SECTIONS.filter((s) => sections.includes(s.key)).map(({ key, label }) => {
    const base = { key, label, verdict: null, note: null };
    if (key === "bio") {
      const rows: FormDiffRow[] = BIO_FIELDS.filter(([f]) => payload[f] !== undefined).map(([field, label]) => {
        const before = baseline[field];
        const proposed = payload[field] ?? null;
        const now = current[field];
        return { field, label, baseline: before, proposed, current: now, status: proposed === before ? "unchanged" : now !== before ? "conflict" : "changed" };
      });
      // A photo alone still makes the section worth applying.
      return { ...base, mode: "update" as const, rows, applicable: true };
    }
    // Travel and needs were never shown to the submitter: only what they sent.
    const fields = key === "travel" ? TRAVEL_FIELDS : NEEDS_FIELDS;
    const rows: FormDiffRow[] = fields
      .filter(([f]) => payload[f])
      .map(([field, label]) => ({
        field,
        label,
        baseline: null,
        proposed: field === "arrivalAt" || field === "departureAt" ? payload[field]!.replace("T", " ") : payload[field]!,
        current: null,
        status: "changed" as const,
      }));
    return { ...base, mode: "create" as const, rows, applicable: rows.length > 0 };
  });
}

async function headshotChoice(files: SubmissionFile[]): Promise<ReviewChoice[]> {
  const images = files.filter((f) => HEADSHOT_MIME_TYPES.has(f.mimeType));
  if (images.length === 0) return [];
  return [
    {
      key: "bio",
      label: "Headshot",
      defaultValue: `file:${images[0].id}`,
      options: [
        ...images.map((f) => ({ value: `file:${f.id}`, label: `Use ${f.fileName}` })),
        { value: "keep", label: "Don't change the headshot" },
      ],
    },
  ];
}

async function applySpeakerProfile(ctx: FormApplyContext<SpeakerProfilePayload, SpeakerProfileBaseline>) {
  const { link, sections, userId, choices } = ctx;
  const { payload, baseline } = ctx.submission;
  const eventId = link.eventId;
  const contactId = link.contactId;
  if (!contactId) throw new Error("This form's speaker no longer exists");
  const applied: string[] = [];
  const filedByApply: string[] = [];

  if (sections.has("bio")) {
    const changed = changedBio(baseline, payload);
    if (changed.length > 0) {
      await updateContactSpeakerFieldsCore(
        contactId,
        Object.fromEntries(changed.map((f) => [f, payload[f] ?? null])),
        userId,
        link.tenantId,
      );
    }
    const pick = choices.bio;
    if (pick?.startsWith("file:")) {
      const fileId = pick.slice("file:".length);
      const file = await prisma.fileUpload.findFirst({ where: { id: fileId, formSubmissionId: ctx.submission.id } });
      if (!file || !HEADSHOT_MIME_TYPES.has(file.mimeType)) throw new PermissionError("NOT_FOUND", "File not found");
      await requirePermissionForUser(userId, "CONTACTS", "WRITE", { tenantId: link.tenantId });
      mkdirSync(getUploadDir("contact", contactId), { recursive: true });
      copyFileSync(getUploadPath("formSubmission", ctx.submission.id, file.storedName), getUploadPath("contact", contactId, file.storedName));
      const copy = await prisma.fileUpload.create({
        data: { fileName: file.fileName, storedName: file.storedName, mimeType: file.mimeType, fileSize: file.fileSize, contactId },
      });
      await setContactHeadshotCore(contactId, copy.id, userId, link.tenantId);
      filedByApply.push(file.id);
    }
    applied.push("bio");
  }

  const timezone = link.event.timezone || "America/Chicago";
  const profile: Parameters<typeof upsertSpeakerProfileCore>[2] = {};
  // Blank never clears: the submitter wasn't shown what's on file.
  if (sections.has("travel")) {
    if (payload.arrivalAt) profile.arrivalAt = parseDateTimeInTimezone(payload.arrivalAt, timezone);
    if (payload.departureAt) profile.departureAt = parseDateTimeInTimezone(payload.departureAt, timezone);
    if (payload.hotel) profile.hotel = payload.hotel;
    if (payload.travelNotes) profile.travelNotes = payload.travelNotes;
  }
  if (sections.has("needs")) {
    if (payload.dietary) profile.dietary = payload.dietary;
    if (payload.avNeeds) profile.avNeeds = payload.avNeeds;
    if (payload.shirtSize) profile.shirtSize = payload.shirtSize;
  }
  if (Object.keys(profile).length > 0) {
    await upsertSpeakerProfileCore(eventId, contactId, profile, userId);
    for (const k of ["travel", "needs"]) if (sections.has(k)) applied.push(k);
  }
  return { applied, filedByApply };
}

async function speakerSnapshot(presentationId: string, contactId: string, eventId: string) {
  const speaker = await prisma.presentationContact.findFirst({
    where: { presentationId, contactId, presentation: { eventId } },
    select: {
      presentation: { select: { title: true } },
      contact: {
        select: { firstName: true, lastName: true, bio: true, jobTitle: true, pronouns: true, website: true, headshotFileId: true, updatedAt: true },
      },
    },
  });
  if (!speaker) return null;
  const profile = await prisma.speakerProfile.findUnique({
    where: { eventId_contactId: { eventId, contactId } },
    select: { updatedAt: true },
  });
  const c = speaker.contact;
  return {
    baseline: {
      speakerName: [c.firstName, c.lastName].filter(Boolean).join(" "),
      presentationTitle: speaker.presentation.title,
      bio: c.bio,
      jobTitle: c.jobTitle,
      pronouns: c.pronouns,
      website: c.website,
      hasHeadshot: c.headshotFileId != null,
    } satisfies SpeakerProfileBaseline,
    version: `${c.updatedAt.toISOString()}|${profile?.updatedAt.toISOString() ?? ""}`,
  };
}

export const speakerProfileModule: FormModule<SpeakerProfilePayload, SpeakerProfileBaseline> = {
  sectionKeys: SPEAKER_PROFILE_SECTION_KEYS,
  open: false,
  externalUpload: false,
  async assertTarget({ eventId, presentationId, contactId }, userId) {
    if (!presentationId || !contactId) throw new Error("Pick the speaker");
    await requirePermissionForUser(userId, "PRESENTATIONS", "VIEW", eventId);
    const speaker = await prisma.presentationContact.findFirst({
      where: { presentationId, contactId, presentation: { eventId } },
      select: { id: true },
    });
    if (!speaker) throw new PermissionError("NOT_FOUND", "Speaker not found");
  },
  async snapshot(link) {
    if (!link.presentationId || !link.contactId) return null;
    const snap = await speakerSnapshot(link.presentationId, link.contactId, link.eventId);
    if (!snap) return null;
    return {
      baseline: snap.baseline,
      sections: readFormLinkConfig(link.config, SPEAKER_PROFILE_SECTION_KEYS).sections,
      version: snap.version,
      targetName: snap.baseline.speakerName,
    };
  },
  parse: async (formData, snapshot) => parseSpeakerProfile(formData, snapshot.sections),
  rebase(payload, oldBaseline, newBaseline) {
    if (!oldBaseline) return payload;
    const next = { ...payload };
    for (const [f] of BIO_FIELDS) {
      if (next[f] !== undefined && (next[f] ?? null) === oldBaseline[f]) next[f] = newBaseline[f];
    }
    return next;
  },
  diff: diffSpeakerProfile,
  reviewChoices: (_payload, _link, files) => headshotChoice(files),
  apply: applySpeakerProfile,
};
