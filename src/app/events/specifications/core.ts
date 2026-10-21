// Pure cores for the event's ESG Part I (EventSpecification + its grids).
// NOT a "use server" file — see src/app/contacts/core.ts for the rationale.
// Server Actions in ./actions.ts and the MCP tools both call these.

import { Prisma, ProvidedBy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import {
  ESG_SECTION_LETTERS,
  ESG_WRITABLE_FIELDS,
  SPEC_GRID_COLUMNS,
  type EsgFieldDef,
  type EsgFieldKind,
  type SpecGrid,
} from "@/lib/esg/fields";
import { setFunctionNumbersLocked } from "@/lib/functionNumbering";
import { PER_SECTION_LETTERS, PER_WRITABLE_FIELDS } from "@/lib/esg/perFields";

const FIELD_BY_KEY = new Map(ESG_WRITABLE_FIELDS.map((f) => [f.key, f]));
const PROVIDED_BY_VALUES = new Set<string>(Object.values(ProvidedBy));

async function todayForEvent(eventId: string): Promise<Date> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  return new Date(`${getDateKeyInTimezone(new Date(), event?.timezone || "America/Chicago")}T00:00:00Z`);
}

// Type-checks one value against its field kind and asserts any reference
// belongs to the event's tenant (a foreign id is a not-found).
export async function checkValue(
  eventId: string,
  tenantId: string,
  key: string,
  kind: EsgFieldKind,
  value: unknown,
): Promise<void> {
  if (value === null) return;
  const bad = () => {
    throw new Error(`Invalid value for ${key}`);
  };
  switch (kind) {
    case "text":
    case "textarea":
    case "richtext":
    case "option":
      if (typeof value !== "string") bad();
      return;
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) bad();
      return;
    case "bool":
      if (typeof value !== "boolean") bad();
      return;
    case "date":
    case "datetime":
      if (!(value instanceof Date) || isNaN(value.getTime())) bad();
      return;
    case "providedBy":
      if (typeof value !== "string" || !PROVIDED_BY_VALUES.has(value)) bad();
      return;
    case "vendor": {
      if (typeof value !== "string") bad();
      const found = await prisma.vendor.findFirst({ where: { id: value as string, tenantId }, select: { id: true } });
      if (!found) throw new PermissionError("NOT_FOUND", "Vendor not found");
      return;
    }
    case "contact": {
      if (typeof value !== "string") bad();
      const found = await prisma.contact.findFirst({ where: { id: value as string, tenantId }, select: { id: true } });
      if (!found) throw new PermissionError("NOT_FOUND", "Contact not found");
      return;
    }
    case "function": {
      if (typeof value !== "string") bad();
      const found = await prisma.function.findFirst({ where: { id: value as string, eventId }, select: { id: true } });
      if (!found) throw new PermissionError("NOT_FOUND", "Function not found");
      return;
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled ESG field kind: ${_exhaustive}`);
    }
  }
}

// Partial update of the event's specification. Keys must be ESG fields
// (src/lib/esg/fields.ts); narrative keys merge into the existing JSON. Date
// Revised is set only when the caller passes it or by issueEsgCore.
export async function upsertEventSpecificationCore(
  eventId: string,
  values: Record<string, unknown>,
  userId: string,
) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);

  const columns: Record<string, unknown> = {};
  const narrativePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const field: EsgFieldDef | undefined = FIELD_BY_KEY.get(key);
    if (!field) throw new Error(`Unknown specification field: ${key}`);
    await checkValue(eventId, tenantId, key, field.kind, value);
    if (field.storage === "column") columns[key] = value;
    else narrativePatch[key] = value;
  }

  const existing = await prisma.eventSpecification.findUnique({
    where: { eventId },
    select: { narrative: true },
  });
  const narrative = {
    ...((existing?.narrative as Record<string, unknown> | null) ?? {}),
    ...narrativePatch,
  };
  // Drop cleared keys so the JSON only holds real values.
  for (const k of Object.keys(narrative)) if (narrative[k] === null) delete narrative[k];

  const data = { ...columns, narrative: narrative as Prisma.InputJsonValue, updatedById: userId };
  return prisma.eventSpecification.upsert({
    where: { eventId },
    create: { eventId, ...data },
    update: data,
  });
}

export async function setSpecSectionNaCore(eventId: string, letter: string, na: boolean, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  if (!ESG_SECTION_LETTERS.includes(letter)) throw new Error(`Unknown ESG section: ${letter}`);
  const existing = await prisma.eventSpecification.findUnique({ where: { eventId }, select: { naSections: true } });
  const set = new Set(existing?.naSections ?? []);
  if (na) set.add(letter);
  else set.delete(letter);
  const naSections = ESG_SECTION_LETTERS.filter((l) => set.has(l));
  return prisma.eventSpecification.upsert({
    where: { eventId },
    create: { eventId, naSections, updatedById: userId },
    update: { naSections, updatedById: userId },
  });
}

// "Issue ESG": stamps Date Originated (first issue only) and locks function
// numbers so signage and diagrams can rely on them.
export async function issueEsgCore(eventId: string, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const today = await todayForEvent(eventId);
  const existing = await prisma.eventSpecification.findUnique({ where: { eventId }, select: { dateOriginated: true } });
  await prisma.eventSpecification.upsert({
    where: { eventId },
    create: { eventId, dateOriginated: today, updatedById: userId },
    update: existing?.dateOriginated ? { dateRevised: today, updatedById: userId } : { dateOriginated: today, updatedById: userId },
  });
  await setFunctionNumbersLocked(eventId, true);
}

// ---------------------------------------------------------------------------
// Grids (VIPs, shuttle routes, transfers, shipments, coverage, keys)

type GridDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string; eventId: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  delete(args: { where: { id: string; eventId: string } }): Promise<unknown>;
  aggregate(args: { where: { eventId: string }; _max: { sortOrder: true } }): Promise<{ _max: { sortOrder: number | null } }>;
};

// The six grid models share a shape (eventId, sortOrder, scalar columns);
// the column whitelist below is what keeps writes inside it.
function gridDelegate(grid: SpecGrid): GridDelegate {
  switch (grid) {
    case "vips":
      return prisma.eventSpecVip as unknown as GridDelegate;
    case "shuttles":
      return prisma.eventSpecShuttleRoute as unknown as GridDelegate;
    case "transfers":
      return prisma.eventSpecTransfer as unknown as GridDelegate;
    case "shipments":
      return prisma.eventSpecShipment as unknown as GridDelegate;
    case "coverage":
      return prisma.eventSpecCoverage as unknown as GridDelegate;
    case "keys":
      return prisma.eventSpecKey as unknown as GridDelegate;
    case "futureDates":
      return prisma.eventPostEventFutureDate as unknown as GridDelegate;
    case "distributions":
      return prisma.eventPostEventDistribution as unknown as GridDelegate;
    default: {
      const _exhaustive: never = grid;
      throw new Error(`Unhandled specification grid: ${_exhaustive}`);
    }
  }
}

async function checkGridValues(eventId: string, grid: SpecGrid, values: Record<string, unknown>, creating: boolean) {
  const tenantId = await requireEventTenantId(eventId);
  const columns = SPEC_GRID_COLUMNS[grid];
  const byKey = new Map(columns.map((c) => [c.key, c]));
  for (const [key, value] of Object.entries(values)) {
    const column = byKey.get(key);
    if (!column) throw new Error(`Unknown ${grid} column: ${key}`);
    if (grid === "coverage" && key === "kind") {
      if (value !== "SECURITY" && value !== "FIRST_AID") throw new Error("Coverage must be SECURITY or FIRST_AID");
      continue;
    }
    if (grid === "distributions" && key === "action") {
      if (value !== "COMPLETED" && value !== "REVISED") throw new Error("Distribution must be COMPLETED or REVISED");
      continue;
    }
    if (column.kind === "bool" && value === null) {
      values[key] = false;
      continue;
    }
    await checkValue(eventId, tenantId, key, column.kind, value);
  }
  for (const column of columns) {
    if (!column.required) continue;
    const v = values[column.key];
    if ((creating && v === undefined) || v === null || v === "") throw new Error(`${column.label} is required`);
  }
}

export async function createSpecRowCore(
  eventId: string,
  grid: SpecGrid,
  values: Record<string, unknown>,
  userId: string,
) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  await checkGridValues(eventId, grid, values, true);
  const delegate = gridDelegate(grid);
  const max = await delegate.aggregate({ where: { eventId }, _max: { sortOrder: true } });
  return delegate.create({ data: { ...values, eventId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
}

export async function updateSpecRowCore(
  eventId: string,
  grid: SpecGrid,
  rowId: string,
  values: Record<string, unknown>,
  userId: string,
) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  await checkGridValues(eventId, grid, values, false);
  return gridDelegate(grid).update({ where: { id: rowId, eventId }, data: values });
}

export async function deleteSpecRowCore(eventId: string, grid: SpecGrid, rowId: string, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  await gridDelegate(grid).delete({ where: { id: rowId, eventId } });
}

// ---------------------------------------------------------------------------
// Post-Event Report (EventPostEvent) — same whitelist / narrative-merge rules
// as the specification, against src/lib/esg/perFields.ts.

const PER_FIELD_BY_KEY = new Map(PER_WRITABLE_FIELDS.map((f) => [f.key, f]));

export async function upsertPostEventCore(eventId: string, values: Record<string, unknown>, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const columns: Record<string, unknown> = {};
  const narrativePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = PER_FIELD_BY_KEY.get(key);
    if (!field) throw new Error(`Unknown post-event field: ${key}`);
    await checkValue(eventId, tenantId, key, field.kind, value);
    if (field.storage === "column") columns[key] = value;
    else narrativePatch[key] = value;
  }
  const existing = await prisma.eventPostEvent.findUnique({ where: { eventId }, select: { narrative: true } });
  const narrative = { ...((existing?.narrative as Record<string, unknown> | null) ?? {}), ...narrativePatch };
  for (const k of Object.keys(narrative)) if (narrative[k] === null) delete narrative[k];
  const data = { ...columns, narrative: narrative as Prisma.InputJsonValue, updatedById: userId };
  return prisma.eventPostEvent.upsert({ where: { eventId }, create: { eventId, ...data }, update: data });
}

export async function setPostEventSectionNaCore(eventId: string, letter: string, na: boolean, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  if (!PER_SECTION_LETTERS.includes(letter)) throw new Error(`Unknown PER section: ${letter}`);
  const existing = await prisma.eventPostEvent.findUnique({ where: { eventId }, select: { naSections: true } });
  const set = new Set(existing?.naSections ?? []);
  if (na) set.add(letter);
  else set.delete(letter);
  const naSections = PER_SECTION_LETTERS.filter((l) => set.has(l));
  return prisma.eventPostEvent.upsert({
    where: { eventId },
    create: { eventId, naSections, updatedById: userId },
    update: { naSections, updatedById: userId },
  });
}
