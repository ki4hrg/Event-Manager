// Item Request: an open link for people without an account to ask for printed
// pieces or supplies, or to say items are on their way. Each line becomes an
// item on a print or supply order — a new one, or one the reviewer picks.
// Server-only module.
//
// Writes only plain-text columns (descriptions, names, notes) and enums.

import { prisma } from "@/lib/prisma";
import { PermissionError } from "@/lib/permissions";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { getEventRooms } from "@/lib/eventVenues";
import { createPrintItemCore, createPrintOrderCore } from "@/app/events/print-orders/core";
import { createSupplyOrderCore, createSupplyOrderItemCore } from "@/app/events/supply-orders/core";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { PublicFormError } from "./links";
import {
  ITEM_KINDS,
  ITEM_REQUEST_MAX_LINES,
  ITEM_REQUEST_MODES,
  ITEM_REQUEST_SECTION_KEYS,
  ITEM_SOURCES,
  optionLabel,
  type FormDiffRow,
  type FormDiffSection,
  type ItemKind,
  type ItemRequestBaseline,
  type ItemRequestLine,
  type ItemRequestMode,
  type ItemRequestPayload,
  type ItemSource,
} from "./meta";
import type { FileTarget, FormApplyContext, FormModule, ReviewChoice } from "./types";

const STATES: Record<ItemSource, { acquisitionState: AcquisitionState; packingStatus: PackingStatus }> = {
  procure: { acquisitionState: "TO_PROCURE", packingStatus: "NEEDED" },
  shipping: { acquisitionState: "DROP_SHIP", packingStatus: "IN_TRANSIT" },
  bringing: { acquisitionState: "ON_HAND", packingStatus: "NEEDED" },
};

// ─── Public projection ───────────────────────────────────────────────────────

async function destinations(eventId: string): Promise<ItemRequestBaseline["destinations"]> {
  const [functions, rooms] = await Promise.all([
    prisma.function.findMany({
      where: { eventId, OR: [{ status: null }, { status: { not: "CANCELLED" } }] },
      select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } },
    }),
    getEventRooms(eventId),
  ]);
  const multiVenue = new Set(rooms.map((r) => r.venue.id)).size > 1;
  return [
    ...functions
      .map((f) => ({ value: `function:${f.id}`, label: formatFunctionLabel(f) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    ...rooms.map((r) => ({ value: `room:${r.id}`, label: multiVenue ? `${r.name} (${r.venue.name})` : r.name })),
  ];
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

function oneOf<T extends string>(value: string | null, list: readonly { value: T }[]): T | null {
  if (value == null) return null;
  const hit = list.find((o) => o.value === value);
  if (!hit) throw new PublicFormError("invalid");
  return hit.value;
}

async function parseItemRequest(formData: FormData, baseline: ItemRequestBaseline): Promise<ItemRequestPayload> {
  let tooMany = false;
  formData.forEach((_, key) => {
    const m = /^item_(\d+)_/.exec(key);
    if (m && parseInt(m[1], 10) >= ITEM_REQUEST_MAX_LINES) tooMany = true;
  });
  if (tooMany) throw new PublicFormError("invalid");
  const mode: ItemRequestMode = oneOf(text(formData, "mode", 20), ITEM_REQUEST_MODES) ?? "request";
  const valid = new Set(baseline.destinations.map((d) => d.value));
  const items: ItemRequestLine[] = [];
  for (let i = 0; i < ITEM_REQUEST_MAX_LINES; i++) {
    const description = text(formData, `item_${i}_description`, 300);
    if (!description) continue;
    const qty = text(formData, `item_${i}_quantity`, 7);
    if (qty !== null && !/^\d+$/.test(qty)) throw new PublicFormError("invalid");
    const neededBy = text(formData, `item_${i}_neededBy`, 10);
    if (neededBy !== null && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) throw new PublicFormError("invalid");
    const destination = text(formData, `item_${i}_destination`, 60);
    if (destination !== null && !valid.has(destination)) throw new PublicFormError("invalid");
    const source = oneOf(text(formData, `item_${i}_source`, 20), ITEM_SOURCES) ?? (mode === "incoming" ? "shipping" : "procure");
    if (mode === "incoming" && source === "procure") throw new PublicFormError("invalid");
    items.push({
      description,
      quantity: qty === null ? null : parseInt(qty, 10),
      kind: oneOf(text(formData, `item_${i}_kind`, 10), ITEM_KINDS) ?? "supply",
      neededBy,
      destination,
      source,
      carrier: text(formData, `item_${i}_carrier`, 80),
      tracking: text(formData, `item_${i}_tracking`, 120),
      notes: text(formData, `item_${i}_notes`, 1000),
    });
  }
  return { mode, items };
}

// ─── Review ──────────────────────────────────────────────────────────────────

function formatDay(value: string | null): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function diffItemRequest(baseline: ItemRequestBaseline, payload: ItemRequestPayload): FormDiffSection[] {
  return payload.items.map((line, i) => {
    const fields: [string, string, string | null][] = [
      ["description", "Description", line.description],
      ["quantity", "Quantity", line.quantity == null ? null : String(line.quantity)],
      ["kind", "Type", optionLabel(ITEM_KINDS, line.kind)],
      ["neededBy", "Needed by", formatDay(line.neededBy)],
      ["destination", "For", optionLabel(baseline.destinations, line.destination)],
      ["source", "Source", optionLabel(ITEM_SOURCES, line.source)],
      ["carrier", "Carrier", line.carrier],
      ["tracking", "Tracking", line.tracking],
      ["notes", "Notes", line.notes],
    ];
    const rows: FormDiffRow[] = fields
      .filter(([, , v]) => v != null)
      .map(([field, label, proposed]) => ({ field, label, baseline: null, proposed, current: null, status: "changed" }));
    return {
      key: `item-${i}`,
      label: `${i + 1}. ${line.description}`,
      mode: "create" as const,
      verdict: null,
      note: null,
      rows,
      applicable: true,
    };
  });
}

async function eventOrders(eventId: string) {
  const live = { OR: [{ status: null }, { status: { not: "CANCELLED" as const } }] };
  const [print, supply] = await Promise.all([
    prisma.printOrder.findMany({ where: { eventId, ...live }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplyOrder.findMany({ where: { eventId, ...live }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { print, supply };
}

async function itemRequestChoices(payload: ItemRequestPayload, eventId: string): Promise<ReviewChoice[]> {
  const orders = await eventOrders(eventId);
  const options = [
    { value: "new-print", label: "New print order" },
    { value: "new-supply", label: "New supply order" },
    ...orders.print.map((o) => ({ value: `print:${o.id}`, label: `Add to print order: ${o.name}` })),
    ...orders.supply.map((o) => ({ value: `supply:${o.id}`, label: `Add to supply order: ${o.name}` })),
    { value: "skip", label: "Skip" },
  ];
  return payload.items.map((line, i) => ({
    key: `item-${i}`,
    label: "Add to",
    options,
    defaultValue: `new-${line.kind}`,
  }));
}

// ─── Apply ───────────────────────────────────────────────────────────────────

type Target = { kind: ItemKind; orderId: string | null };

function readChoice(value: string | undefined, line: ItemRequestLine): Target | null {
  const v = value ?? `new-${line.kind}`;
  if (v === "skip") return null;
  if (v === "new-print") return { kind: "print", orderId: null };
  if (v === "new-supply") return { kind: "supply", orderId: null };
  const m = /^(print|supply):(.+)$/.exec(v);
  if (!m) return null;
  return { kind: m[1] as ItemKind, orderId: m[2] };
}

function lineNotes(line: ItemRequestLine): string | null {
  const parts = [
    line.neededBy ? `Needed by ${formatDay(line.neededBy)}` : null,
    line.carrier ? `Carrier: ${line.carrier}` : null,
    line.tracking ? `Tracking: ${line.tracking}` : null,
    line.notes,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

async function applyItemRequest(ctx: FormApplyContext<ItemRequestPayload, ItemRequestBaseline>) {
  const { link, sections, userId, choices } = ctx;
  const { payload, baseline } = ctx.submission;
  const eventId = link.eventId;

  // Destinations are re-checked against the event as it is now: a function
  // deleted since the submission drops to no destination rather than failing.
  const [functionIds, rooms] = await Promise.all([
    prisma.function.findMany({ where: { eventId }, select: { id: true } }).then((r) => new Set(r.map((f) => f.id))),
    getEventRooms(eventId).then((r) => new Set(r.map((room) => room.id))),
  ]);
  const place = (destination: string | null) => {
    const [kind, id] = destination?.split(":") ?? [];
    return {
      functionId: kind === "function" && functionIds.has(id) ? id : null,
      roomId: kind === "room" && rooms.has(id) ? id : null,
      label: optionLabel(baseline.destinations, destination),
    };
  };

  const requester = ctx.submission.submitterName || "Item request";
  const newOrders = new Map<string, string>();
  const created: { printOrders: string[]; supplyOrders: string[] } = { printOrders: [], supplyOrders: [] };
  let filesTo: FileTarget | undefined;
  const applied: string[] = [];

  for (let i = 0; i < payload.items.length; i++) {
    const line = payload.items[i];
    const key = `item-${i}`;
    if (!sections.has(key)) continue;
    const target = readChoice(choices[key], line);
    if (!target) continue;

    let orderId = target.orderId;
    if (orderId) {
      const found =
        target.kind === "print"
          ? await prisma.printOrder.findFirst({ where: { id: orderId, eventId }, select: { id: true } })
          : await prisma.supplyOrder.findFirst({ where: { id: orderId, eventId }, select: { id: true } });
      if (!found) throw new PermissionError("NOT_FOUND", "Order not found");
    } else {
      const where = place(line.destination);
      const groupKey = `${target.kind}|${where.functionId ?? ""}|${where.roomId ?? ""}`;
      orderId = newOrders.get(groupKey) ?? null;
      if (!orderId) {
        const name = where.label ? `${requester} — ${where.label}` : requester;
        const notes = `From the item request form (${optionLabel(ITEM_REQUEST_MODES, payload.mode)}).`;
        if (target.kind === "print") {
          const order = await createPrintOrderCore(
            eventId,
            { name, notes, roomId: where.roomId, specificLocation: null, functionId: where.functionId, presentationId: null, vendorId: null },
            userId,
          );
          orderId = order.id;
          created.printOrders.push(order.id);
        } else {
          const order = await createSupplyOrderCore(
            eventId,
            {
              name,
              notes,
              roomId: where.roomId,
              specificLocation: null,
              providerVendorId: null,
              providerContactId: null,
              functionId: where.functionId,
              presentationId: null,
            },
            userId,
          );
          orderId = order.id;
          created.supplyOrders.push(order.id);
        }
        newOrders.set(groupKey, orderId);
      }
    }

    const states = STATES[line.source];
    if (target.kind === "print") {
      await createPrintItemCore(
        orderId,
        eventId,
        {
          description: line.description,
          quantity: line.quantity,
          ...states,
          distributionMethod: null,
          distributionNotes: null,
          designerVendorId: null,
          designerContactId: null,
          printerVendorId: null,
          printerContactId: null,
          notes: lineNotes(line),
          sourceLocationId: null,
        },
        userId,
      );
    } else {
      await createSupplyOrderItemCore(
        orderId,
        eventId,
        {
          description: line.description,
          equipmentId: null,
          quantity: line.quantity,
          ...states,
          providerVendorId: null,
          providerContactId: null,
          notes: lineNotes(line),
          sourceLocationId: null,
          containerLocationId: null,
          inventoryItemId: null,
        },
        userId,
      );
    }
    filesTo ??= { entityType: target.kind === "print" ? "printOrder" : "supplyOrder", entityId: orderId };
    applied.push(key);
  }
  return { applied, filesTo, created };
}

export const itemRequestModule: FormModule<ItemRequestPayload, ItemRequestBaseline> = {
  sectionKeys: ITEM_REQUEST_SECTION_KEYS,
  open: true,
  async assertTarget() {},
  async snapshot(link) {
    return {
      baseline: { destinations: await destinations(link.eventId) },
      sections: ["items"],
      // Creates records only: nothing on file for the submitter to go stale on.
      version: "1",
      targetName: link.event.name,
    };
  },
  parse: (formData, snapshot) => parseItemRequest(formData, snapshot.baseline),
  rebase: (payload) => payload,
  diff: (baseline, payload) => diffItemRequest(baseline, payload),
  reviewChoices: (payload, link) => itemRequestChoices(payload, link.eventId),
  apply: applyItemRequest,
};
