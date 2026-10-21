// Function Review: a function's sponsor confirms or corrects the setup details
// staff have on file. Server-only module (prisma, cores); the shapes it reads
// and writes live in ./meta so the client form can share them.
//
// Writes on apply are limited to the plain-text and numeric columns listed in
// APPLY_FIELDS. Rich-text columns (catering menuContent, setup detail
// descriptions, spec narrative) render through dangerouslySetInnerHTML in
// staff and share views and must never take public input.

import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError } from "@/lib/permissions";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { formatTimeRange } from "@/lib/agendaUtils";
import { getOptionsForEvent } from "@/lib/options";
import { updateFunctionEsgCore, addFunctionContactCore, createAndAddFunctionContactCore } from "@/app/events/functions/core";
import { updateCateringOrderCore } from "@/app/events/catering-orders/core";
import { PublicFormError } from "./links";
import { contactReviewChoice, resolveContactChoice } from "./contacts";
import type { FormApplyContext, FormModule } from "./types";
import {
  FUNCTION_REVIEW_SECTIONS,
  FUNCTION_REVIEW_SECTION_KEYS,
  readFormLinkConfig,
  type FormDiffRow,
  type FormDiffSection,
  type FunctionReviewBaseline,
  type FunctionReviewPayload,
  type FunctionReviewSection,
  type SectionResponse,
} from "./meta";

const NOTE_MAX = 2000;
const NAME_MAX = 120;
const COUNT_MAX = 100_000;

// ─── Public projection ───────────────────────────────────────────────────────

export async function functionReviewBaseline(
  functionId: string,
  eventId: string,
  timezone: string,
): Promise<FunctionReviewBaseline | null> {
  const fn = await prisma.function.findFirst({
    where: { id: functionId, eventId },
    select: {
      name: true,
      functionNumber: true,
      breakoutGroup: { select: { name: true } },
      description: true,
      expectedAttendance: true,
      defaultSetup: true,
      decorNotes: true,
      signageNotes: true,
      rooms: { select: { room: { select: { name: true } } } },
      schedules: { select: { type: true, startTime: true, endTime: true }, orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }] },
      cateringOrder: { select: { mealType: true, serviceStyle: true, expectedCount: true, dietaryNotes: true } },
      avOrderFunctions: {
        select: {
          avOrder: {
            select: {
              name: true,
              status: true,
              equipmentItems: { select: { item: true, quantity: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      setupOrderFunctions: {
        select: {
          setupOrder: {
            select: {
              name: true,
              setupType: true,
              status: true,
              tables: { select: { quantity: true, tableType: true, chairCount: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      printOrderFunctions: {
        select: {
          printOrder: {
            select: { name: true, status: true, items: { select: { description: true, quantity: true } } },
          },
        },
      },
      supplyOrderLinks: {
        select: {
          supplyOrder: {
            select: {
              name: true,
              status: true,
              items: { select: { description: true, quantity: true, equipment: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!fn) return null;
  const live = <T extends { status: string | null }>(o: T) => o.status !== "CANCELLED";
  return {
    functionLabel: formatFunctionLabel(fn),
    description: fn.description,
    expectedAttendance: fn.expectedAttendance,
    defaultSetup: fn.defaultSetup,
    decorNotes: fn.decorNotes,
    signageNotes: fn.signageNotes,
    rooms: fn.rooms.map((r) => r.room.name),
    schedules: fn.schedules.map((s) => ({ type: s.type, time: formatTimeRange(s.startTime, s.endTime, timezone) })),
    catering: fn.cateringOrder,
    av: fn.avOrderFunctions
      .map((l) => l.avOrder)
      .filter(live)
      .map((o) => ({ order: o.name, items: o.equipmentItems })),
    setup: fn.setupOrderFunctions
      .map((l) => l.setupOrder)
      .filter(live)
      .map((o) => ({
        order: o.name ?? "Setup",
        setupType: o.setupType,
        tables: o.tables.map(
          (t) => `${t.quantity} × ${t.tableType ?? "table"}${t.chairCount != null ? `, ${t.chairCount} chairs each` : ""}`,
        ),
      })),
    materials: [
      ...fn.printOrderFunctions
        .map((l) => l.printOrder)
        .filter(live)
        .map((o) => ({ order: o.name, items: o.items })),
      ...fn.supplyOrderLinks
        .map((l) => l.supplyOrder)
        .filter(live)
        .map((o) => ({
          order: o.name,
          items: o.items.map((i) => ({ description: i.description ?? i.equipment?.name ?? "Item", quantity: i.quantity })),
        })),
    ],
  };
}

// The sections a link asked for, minus ones the function has nothing for.
function functionReviewSections(configured: string[], baseline: FunctionReviewBaseline): FunctionReviewSection[] {
  return FUNCTION_REVIEW_SECTIONS.map((s) => s.key).filter(
    (key) => configured.includes(key) && (key !== "catering" || baseline.catering !== null),
  );
}

export async function functionReviewSetupTypes(eventId: string): Promise<string[]> {
  return (await getOptionsForEvent(eventId, "setup_type")).map((o) => o.label);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function text(formData: FormData, key: string, max: number): string | null {
  const raw = formData.get(key);
  if (raw == null) return null;
  if (typeof raw !== "string") throw new PublicFormError("invalid");
  const value = raw.trim();
  if (value.length > max) throw new PublicFormError("invalid");
  return value || null;
}

function count(formData: FormData, key: string): number | null {
  const value = text(formData, key, 10);
  if (value == null) return null;
  if (!/^\d+$/.test(value)) throw new PublicFormError("invalid");
  const n = parseInt(value, 10);
  if (n > COUNT_MAX) throw new PublicFormError("invalid");
  return n;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function parseFunctionReviewPayload(
  formData: FormData,
  sections: FunctionReviewSection[],
  eventId: string,
): Promise<FunctionReviewPayload> {
  const on = new Set(sections);
  const responses: FunctionReviewPayload["responses"] = {};
  for (const key of sections) {
    const verdict = text(formData, `r_${key}_verdict`, 10);
    if (verdict !== null && verdict !== "ok" && verdict !== "changes") throw new PublicFormError("invalid");
    responses[key] = { verdict, note: text(formData, `r_${key}_note`, NOTE_MAX) };
  }
  const payload: FunctionReviewPayload = { responses };
  if (on.has("overview")) {
    payload.description = text(formData, "description", NOTE_MAX);
    payload.expectedAttendance = count(formData, "expectedAttendance");
  }
  if (on.has("setup")) {
    const setup = text(formData, "defaultSetup", NAME_MAX);
    if (setup !== null && !(await functionReviewSetupTypes(eventId)).includes(setup)) throw new PublicFormError("invalid");
    payload.defaultSetup = setup;
  }
  if (on.has("catering")) {
    payload.cateringExpectedCount = count(formData, "cateringExpectedCount");
    payload.dietaryNotes = text(formData, "dietaryNotes", NOTE_MAX);
  }
  if (on.has("signage")) {
    payload.signageNotes = text(formData, "signageNotes", NOTE_MAX);
    payload.decorNotes = text(formData, "decorNotes", NOTE_MAX);
  }
  if (on.has("contact")) {
    const firstName = text(formData, "contactFirstName", NAME_MAX);
    const lastName = text(formData, "contactLastName", NAME_MAX);
    const email = text(formData, "contactEmail", 200);
    const phone = text(formData, "contactPhone", 40);
    if (email && !EMAIL_RE.test(email)) throw new PublicFormError("invalid");
    if (!firstName && (lastName || email || phone)) throw new PublicFormError("invalid");
    payload.contact = firstName ? { firstName, lastName, email: email?.toLowerCase() ?? null, phone } : null;
  }
  return payload;
}

// ─── Review diff ─────────────────────────────────────────────────────────────

type FieldDef = {
  section: FunctionReviewSection;
  field: keyof FunctionReviewPayload;
  label: string;
  read: (b: FunctionReviewBaseline) => string | number | null;
};

// Every column a Function Review may write. All plain text or integers.
const APPLY_FIELDS: FieldDef[] = [
  { section: "overview", field: "description", label: "Description", read: (b) => b.description },
  { section: "overview", field: "expectedAttendance", label: "Expected attendance", read: (b) => b.expectedAttendance },
  { section: "setup", field: "defaultSetup", label: "Setup style", read: (b) => b.defaultSetup },
  { section: "catering", field: "cateringExpectedCount", label: "Expected count", read: (b) => b.catering?.expectedCount ?? null },
  { section: "catering", field: "dietaryNotes", label: "Dietary needs", read: (b) => b.catering?.dietaryNotes ?? null },
  { section: "signage", field: "signageNotes", label: "Signage", read: (b) => b.signageNotes },
  { section: "signage", field: "decorNotes", label: "Decor", read: (b) => b.decorNotes },
];

const str = (v: string | number | null | undefined) => (v == null ? null : String(v));

// Fields the submitter actually changed. A field they left as shown is never
// written back, so staff edits made since the form opened survive apply.
function changedFields(baseline: FunctionReviewBaseline, payload: FunctionReviewPayload, section: string) {
  return APPLY_FIELDS.filter(
    (f) => f.section === section && payload[f.field] !== undefined && str(payload[f.field] as string | number | null) !== str(f.read(baseline)),
  );
}

function contactLine(c: NonNullable<FunctionReviewPayload["contact"]>): string {
  return [[c.firstName, c.lastName].filter(Boolean).join(" "), c.email, c.phone].filter(Boolean).join(" · ");
}

function diffFunctionReview(
  baseline: FunctionReviewBaseline,
  payload: FunctionReviewPayload,
  current: FunctionReviewBaseline,
  sections: string[],
): FormDiffSection[] {
  return FUNCTION_REVIEW_SECTIONS.filter((s) => sections.includes(s.key)).map(({ key, label }) => {
    const response: SectionResponse = payload.responses[key] ?? { verdict: null, note: null };
    const rows: FormDiffRow[] = APPLY_FIELDS.filter((f) => f.section === key && payload[f.field] !== undefined).map((f) => {
      const before = str(f.read(baseline));
      const proposed = str(payload[f.field] as string | number | null);
      const now = str(f.read(current));
      const status = proposed === before ? "unchanged" : now !== before ? "conflict" : "changed";
      return { field: f.field, label: f.label, baseline: before, proposed, current: now, status };
    });
    if (key === "contact" && payload.contact) {
      rows.push({
        field: "contact",
        label: "New contact",
        baseline: null,
        proposed: contactLine(payload.contact),
        current: null,
        status: "changed",
      });
    }
    const asksForChanges = response.verdict === "changes" && !!response.note;
    return {
      key,
      label,
      mode: "update" as const,
      verdict: response.verdict,
      note: response.note,
      rows,
      applicable: rows.some((r) => r.status !== "unchanged") || asksForChanges,
    };
  });
}

// ─── Apply ───────────────────────────────────────────────────────────────────

// Changes whenever a column this form can write changes; the generic apply
// refuses when the record moved after the reviewer opened the diff.
async function functionReviewVersion(functionId: string, eventId: string): Promise<string | null> {
  const fn = await prisma.function.findFirst({
    where: { id: functionId, eventId },
    select: { updatedAt: true, cateringOrder: { select: { updatedAt: true } } },
  });
  if (!fn) return null;
  return `${fn.updatedAt.toISOString()}|${fn.cateringOrder?.updatedAt.toISOString() ?? ""}`;
}

async function applyFunctionReview(ctx: FormApplyContext<FunctionReviewPayload, FunctionReviewBaseline>) {
  const { link, sections, userId } = ctx;
  const { payload, baseline } = ctx.submission;
  const eventId = link.eventId;
  const functionId = link.functionId;
  if (!functionId) throw new Error("This form's function no longer exists");
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  const fn = await prisma.function.findFirst({
    where: { id: functionId, eventId },
    select: { notes: true, cateringOrder: { select: { id: true } } },
  });
  if (!fn) throw new PermissionError("NOT_FOUND", "The function no longer exists");

  const changed = (section: string) => (sections.has(section) ? changedFields(baseline, payload, section) : []);
  const pick = (section: string, field: keyof FunctionReviewPayload) => changed(section).some((f) => f.field === field);

  const esg: Parameters<typeof updateFunctionEsgCore>[2] = {};
  if (pick("overview", "expectedAttendance")) esg.expectedAttendance = payload.expectedAttendance ?? null;
  if (pick("setup", "defaultSetup")) esg.defaultSetup = payload.defaultSetup ?? null;
  if (pick("signage", "signageNotes")) esg.signageNotes = payload.signageNotes ?? null;
  if (pick("signage", "decorNotes")) esg.decorNotes = payload.decorNotes ?? null;
  const description = pick("overview", "description");

  const catering: Parameters<typeof updateCateringOrderCore>[2] = {};
  if (pick("catering", "cateringExpectedCount")) catering.expectedCount = payload.cateringExpectedCount ?? null;
  if (pick("catering", "dietaryNotes")) catering.dietaryNotes = payload.dietaryNotes ?? null;
  if (Object.keys(catering).length > 0 && !fn.cateringOrder) throw new Error("The function no longer has a catering order");

  // Change requests the record has no column for land on the function's notes.
  const requests = FUNCTION_REVIEW_SECTIONS.filter((s) => sections.has(s.key))
    .map((s) => ({ label: s.label, r: payload.responses[s.key] }))
    .filter(({ r }) => r?.verdict === "changes" && r.note)
    .map(({ label, r }) => `- ${label}: ${r!.note}`);

  if (Object.keys(esg).length > 0) await updateFunctionEsgCore(functionId, eventId, esg, userId);
  if (description || requests.length > 0) {
    const who = [ctx.submission.submitterName, ctx.submission.submitterOrg].filter(Boolean).join(", ") || "sponsor";
    const timezone = link.event.timezone || "America/Chicago";
    const date = ctx.submission.submittedAt.toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
    const notes = requests.length > 0
      ? [fn.notes, `Function review from ${who} (${date}):\n${requests.join("\n")}`].filter(Boolean).join("\n\n")
      : fn.notes;
    await prisma.function.update({
      where: { id: functionId, eventId },
      data: {
        ...(description ? { description: payload.description ?? null } : {}),
        notes,
        updatedById: userId,
      },
    });
  }
  if (fn.cateringOrder && Object.keys(catering).length > 0) {
    await updateCateringOrderCore(fn.cateringOrder.id, eventId, catering, userId);
  }

  let contactId: string | null = null;
  if (sections.has("contact") && payload.contact) {
    const choice = await resolveContactChoice(ctx.choices.contact, link.tenantId);
    if (choice.kind === "new") {
      const added = await createAndAddFunctionContactCore(
        {
          functionId,
          eventId,
          firstName: payload.contact.firstName,
          lastName: payload.contact.lastName ?? "",
          email: payload.contact.email,
          phone: payload.contact.phone,
          organization: ctx.submission.submitterOrg,
          role: "On-site Contact",
        },
        userId,
      );
      contactId = added.contactId;
    } else if (choice.kind === "existing") {
      const linked = await prisma.functionContact.findFirst({ where: { functionId, contactId: choice.contactId }, select: { id: true } });
      if (!linked) await addFunctionContactCore(functionId, eventId, choice.contactId, "On-site Contact", userId);
      contactId = choice.contactId;
    }
  }

  return { applied: FUNCTION_REVIEW_SECTIONS.map((s) => s.key).filter((k) => sections.has(k)), contactId };
}

// A saved draft whose function changed since: fields the submitter left as
// they saw them follow the record; fields they edited keep their answer.
function rebaseFunctionReview(
  payload: FunctionReviewPayload,
  oldBaseline: FunctionReviewBaseline | null,
  newBaseline: FunctionReviewBaseline,
): FunctionReviewPayload {
  if (!oldBaseline) return payload;
  const next: FunctionReviewPayload = { ...payload };
  for (const f of APPLY_FIELDS) {
    if (next[f.field] !== undefined && next[f.field] === f.read(oldBaseline)) {
      (next as Record<string, unknown>)[f.field] = f.read(newBaseline);
    }
  }
  return next;
}

export const functionReviewModule: FormModule<FunctionReviewPayload, FunctionReviewBaseline> = {
  sectionKeys: FUNCTION_REVIEW_SECTION_KEYS,
  open: false,
  externalUpload: false,
  async assertTarget({ eventId, functionId }, userId) {
    if (!functionId) throw new Error("Pick a function");
    await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", eventId);
    const fn = await prisma.function.findFirst({ where: { id: functionId, eventId }, select: { id: true } });
    if (!fn) throw new PermissionError("NOT_FOUND", "Function not found");
  },
  async snapshot(link) {
    if (!link.functionId) return null;
    const timezone = link.event.timezone || "America/Chicago";
    const [baseline, version] = await Promise.all([
      functionReviewBaseline(link.functionId, link.eventId, timezone),
      functionReviewVersion(link.functionId, link.eventId),
    ]);
    if (!baseline || !version) return null;
    return {
      baseline,
      sections: functionReviewSections(readFormLinkConfig(link.config, FUNCTION_REVIEW_SECTION_KEYS).sections, baseline),
      version,
      targetName: baseline.functionLabel,
    };
  },
  parse: (formData, snapshot, link) =>
    parseFunctionReviewPayload(formData, snapshot.sections as FunctionReviewSection[], link.eventId),
  rebase: rebaseFunctionReview,
  diff: diffFunctionReview,
  async reviewChoices(payload, link) {
    if (!payload.contact) return [];
    return [await contactReviewChoice("contact", "On-site contact", payload.contact.email, link.tenantId)];
  },
  apply: applyFunctionReview,
};
