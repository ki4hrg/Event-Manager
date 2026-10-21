// Function Review: a function's sponsor confirms or corrects the setup details
// staff have on file. Server-only module (prisma, cores); the shapes it reads
// and writes live in ./meta so the client form can share them.
//
// Writes on apply are limited to the plain-text and numeric columns listed in
// APPLY_FIELDS. Rich-text columns (catering menuContent, setup detail
// descriptions, spec narrative) render through dangerouslySetInnerHTML in
// staff and share views and must never take public input.

import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, requireEventTenantId, PermissionError } from "@/lib/permissions";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { formatTimeRange } from "@/lib/agendaUtils";
import { getOptionsForEvent } from "@/lib/options";
import { updateFunctionEsgCore, addFunctionContactCore, createAndAddFunctionContactCore } from "@/app/events/functions/core";
import { updateCateringOrderCore } from "@/app/events/catering-orders/core";
import { PublicFormError } from "./links";
import {
  FUNCTION_REVIEW_SECTIONS,
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
export function functionReviewSections(configured: string[], baseline: FunctionReviewBaseline): FunctionReviewSection[] {
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

export async function parseFunctionReviewPayload(
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

export function diffFunctionReview(
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
      verdict: response.verdict,
      note: response.note,
      rows,
      applicable: rows.some((r) => r.status !== "unchanged") || asksForChanges,
    };
  });
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export type FunctionReviewVersions = { function: string; catering: string | null };

export async function functionReviewVersions(functionId: string, eventId: string): Promise<FunctionReviewVersions | null> {
  const fn = await prisma.function.findFirst({
    where: { id: functionId, eventId },
    select: { updatedAt: true, cateringOrder: { select: { updatedAt: true } } },
  });
  if (!fn) return null;
  return { function: fn.updatedAt.toISOString(), catering: fn.cateringOrder?.updatedAt.toISOString() ?? null };
}

// "new" creates a contact from the submitted details; "existing:<id>" links a
// tenant contact the reviewer picked. A matched contact is never updated from
// public input.
export type ContactChoice = "new" | "skip" | `existing:${string}`;

export const STALE_REVIEW = "The function changed after this review was opened. Reload to see the latest before applying.";

export async function applyFunctionReview(args: {
  functionId: string;
  eventId: string;
  baseline: FunctionReviewBaseline;
  payload: FunctionReviewPayload;
  sections: Set<string>;
  versions: FunctionReviewVersions;
  contactChoice: ContactChoice;
  submitter: { name: string | null; org: string | null };
  submittedAt: Date;
  timezone: string;
  userId: string;
}) {
  const { functionId, eventId, baseline, payload, sections, userId } = args;
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  const fn = await prisma.function.findFirst({
    where: { id: functionId, eventId },
    select: { notes: true, updatedAt: true, cateringOrder: { select: { id: true, updatedAt: true } } },
  });
  if (!fn) throw new PermissionError("NOT_FOUND", "The function no longer exists");
  // Compare-and-set on what the reviewer looked at: a write since then means
  // the diff they approved is not the diff that would be applied.
  if (fn.updatedAt.toISOString() !== args.versions.function) throw new Error(STALE_REVIEW);
  if ((fn.cateringOrder?.updatedAt.toISOString() ?? null) !== args.versions.catering) throw new Error(STALE_REVIEW);

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

  const applied: string[] = [];
  if (Object.keys(esg).length > 0) await updateFunctionEsgCore(functionId, eventId, esg, userId);
  if (description || requests.length > 0) {
    const who = [args.submitter.name, args.submitter.org].filter(Boolean).join(", ") || "sponsor";
    const date = args.submittedAt.toLocaleDateString("en-US", { timeZone: args.timezone, month: "short", day: "numeric", year: "numeric" });
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
  if (sections.has("contact") && payload.contact && args.contactChoice !== "skip") {
    if (args.contactChoice === "new") {
      const link = await createAndAddFunctionContactCore(
        {
          functionId,
          eventId,
          firstName: payload.contact.firstName,
          lastName: payload.contact.lastName ?? "",
          email: payload.contact.email,
          phone: payload.contact.phone,
          organization: args.submitter.org,
          role: "On-site Contact",
        },
        userId,
      );
      contactId = link.contactId;
    } else {
      const id = args.contactChoice.slice("existing:".length);
      const tenantId = await requireEventTenantId(eventId);
      const contact = await prisma.contact.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!contact) throw new PermissionError("NOT_FOUND", "Contact not found");
      const linked = await prisma.functionContact.findFirst({ where: { functionId, contactId: id }, select: { id: true } });
      if (!linked) await addFunctionContactCore(functionId, eventId, id, "On-site Contact", userId);
      contactId = id;
    }
  }

  for (const s of FUNCTION_REVIEW_SECTIONS) if (sections.has(s.key)) applied.push(s.key);
  return { sections: applied, contactId };
}

// Tenant contacts sharing the submitted email, for the reviewer's
// "link to existing" choice. Names only; the reviewer is staff.
export async function functionReviewContactMatches(payload: FunctionReviewPayload, tenantId: string) {
  const email = payload.contact?.email;
  if (!email) return [];
  return prisma.contact.findMany({
    where: { tenantId, email: { equals: email, mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, organization: true },
    take: 5,
  });
}
