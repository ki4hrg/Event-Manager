// Builds the EsgDocument from the event's stored specification, the derived
// Part I inputs and its functions. Pure and synchronous: callers load the
// data (src/app/events/reports/data.ts → getEsgData).

import { formatEventDate, getDateKeyInTimezone } from "@/lib/agendaUtils";
import { withGroupDefaults } from "@/lib/boothGroups";
import { formatPhone } from "@/lib/format-phone";
import { partyLabel } from "@/lib/partyLabel";
import { firmestGuestCount } from "@/lib/cateringGuestCount";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { compareFunctionNumbers, roomFunctionNumber } from "@/lib/functionNumbers";
import { functionStartKey } from "@/lib/esg/scheduleKey";
import { APEX_ATTRIBUTION, PROVIDED_BY_LABELS } from "@/lib/esg/apex";
import { ESG_FB_ROWS } from "@/lib/esg/fbGrid";
import {
  COVERAGE_KINDS,
  ESG_HEADER_FIELDS,
  ESG_SECTIONS,
  SPEC_GRID_COLUMNS,
  type EsgDerivedDef,
  type EsgFieldDef,
  type SpecGrid,
} from "@/lib/esg/fields";
import { formatDateOnly, formatDayDate, formatDayDateTime, formatTimeDual, isBlankText } from "@/lib/esg/format";
import { deriveProvidedBy, formatProvidedBy, type ProvidedByVendor } from "@/lib/esg/providedBy";
import type { EsgNarrativeData } from "@/lib/esg/narrativeData";
import type { EsgBoothRow, EsgFunctionRow } from "@/lib/esg/include";
import {
  blankItem,
  type EsgBlock,
  type EsgDocument,
  type EsgItem,
  type EsgOptions,
  type EsgScheduleRow,
  type EsgSection,
  type EsgSetupOrder,
} from "@/lib/esg/types";

const BILLING_SECTIONS = new Set(["W", "X"]);

type Ctx = { data: EsgNarrativeData; tz: string; opts: EsgOptions; support: Set<string> };

function person(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}

function fieldsBlock(items: EsgItem[], showBlank: boolean): EsgBlock | null {
  const kept = showBlank ? items : items.filter((i) => i.value !== null || (i.html && !isBlankText(i.html)));
  return kept.length > 0 ? { kind: "fields", items: kept } : null;
}

function push(blocks: EsgBlock[], block: EsgBlock | null) {
  if (block) blocks.push(block);
}

// ─── Part I ──────────────────────────────────────────────────────────────────

function specRaw(ctx: Ctx, field: EsgFieldDef): unknown {
  const { spec, narrative } = ctx.data;
  return field.storage === "narrative" ? narrative[field.key] : (spec as Record<string, unknown> | null)?.[field.key];
}

function fieldItem(ctx: Ctx, field: EsgFieldDef): EsgItem {
  const raw = specRaw(ctx, field);
  const base = { label: field.label, required: field.required };
  if (raw === null || raw === undefined || raw === "") return { ...base, value: null };
  const { spec, functions } = ctx.data;
  switch (field.kind) {
    case "richtext":
      return { ...base, value: null, html: isBlankText(raw) ? null : (raw as string) };
    case "bool":
      return { ...base, value: raw ? "Yes" : "No" };
    case "date":
      return { ...base, value: formatDateOnly(raw as Date) };
    case "datetime":
      return { ...base, value: formatDayDateTime(raw as Date, ctx.tz) };
    case "int":
      return { ...base, value: String(raw) };
    case "providedBy":
      return { ...base, value: PROVIDED_BY_LABELS[raw as keyof typeof PROVIDED_BY_LABELS] ?? String(raw) };
    case "vendor": {
      const v =
        field.key === "securityVendorId"
          ? spec?.securityVendor
          : field.key === "firstAidVendorId"
            ? spec?.firstAidVendor
            : spec?.transportationVendor;
      return { ...base, value: v?.name ?? null };
    }
    case "contact": {
      const c = spec?.finalBillContact;
      return { ...base, value: c ? [person(c), c.organization].filter(Boolean).join(", ") : null };
    }
    case "function": {
      const f = functions.find((fn) => fn.id === raw);
      return { ...base, value: f ? `${f.functionNumber ? `#${f.functionNumber} · ` : ""}${formatBreakoutSessionName(f.name, f.breakoutGroup?.name)}` : null };
    }
    default:
      return { ...base, value: String(raw) };
  }
}

function gridTable(ctx: Ctx, grid: SpecGrid, title: string): EsgTable | null {
  const rows = ctx.data.grids[grid] as unknown as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const columns = SPEC_GRID_COLUMNS[grid];
  const fnLabel = (id: unknown) => {
    const f = ctx.data.functions.find((fn) => fn.id === id);
    return f ? `${f.functionNumber ? `#${f.functionNumber} · ` : ""}${f.name}` : null;
  };
  return {
    title,
    columns: columns.map((c) => c.label),
    numeric: columns.map((c) => c.kind === "int"),
    rows: rows.map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined || v === "") return null;
        if (c.key === "kind") return COVERAGE_KINDS.find((k) => k.value === v)?.label ?? String(v);
        switch (c.kind) {
          case "datetime":
            return formatDayDateTime(v as Date, ctx.tz);
          case "date":
            return formatDateOnly(v as Date);
          case "bool":
            return v ? "Yes" : "No";
          case "function":
            return fnLabel(v);
          default:
            return String(v);
        }
      }),
    ),
  };
}

type EsgTable = import("@/lib/esg/types").EsgTable;

function derivedBlocks(ctx: Ctx, def: EsgDerivedDef): EsgBlock[] {
  const { data, tz } = ctx;
  const { event } = data;
  switch (def.source) {
    case "eventName":
      return [{ kind: "fields", items: [{ label: def.label, value: event.name, required: def.required }] }];
    case "eventDates":
      return [
        {
          kind: "fields",
          items: [
            { label: "Published event start date", value: formatEventDate(event.startDate, tz, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), required: true },
            { label: "Published event end date", value: formatEventDate(event.endDate, tz, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), required: true },
          ],
        },
      ];
    case "primaryFacility": {
      const v = event.venues[0]?.venue;
      return [
        {
          kind: "fields",
          items: [
            { label: "Primary event facility", value: v?.name ?? null },
            { label: "Event location", value: v ? [v.city, v.state, v.country].filter(Boolean).join(", ") || null : null },
            ...(event.venues.length > 1
              ? [{ label: "Other facilities", value: event.venues.slice(1).map((ev) => ev.venue.name).join(", ") }]
              : []),
          ],
        },
      ];
    }
    case "expectedAttendance": {
      const pct =
        event.expectedAttendance !== null && event.isMembershipBased && event.membershipCount
          ? ` (${Math.round((event.expectedAttendance / event.membershipCount) * 100)}% of membership)`
          : "";
      return [{ kind: "fields", items: [{ label: def.label, value: event.expectedAttendance !== null ? `${event.expectedAttendance}${pct}` : null }] }];
    }
    case "membership":
      return event.isMembershipBased
        ? [{ kind: "fields", items: [{ label: def.label, value: event.membershipCount !== null ? String(event.membershipCount) : null }] }]
        : [];
    case "keyContacts":
      return data.keyStaff.length === 0
        ? [{ kind: "note", text: "No key contacts recorded." }]
        : [
            {
              kind: "table",
              table: {
                title: "Event organizer / host contacts",
                columns: ["Name / title / company", "Telephone / email", "Responsibilities", "Location during event", "Emergency contact?"],
                rows: data.keyStaff.map((k) => [
                  [person(k.contact), k.title, k.contact.organization].filter(Boolean).join("\n"),
                  [k.contact.phone ? formatPhone(k.contact.phone) : null, k.contact.email].filter(Boolean).join("\n") || null,
                  k.responsibilities,
                  k.onSite === true ? "On-site" : k.onSite === false ? "Off-site" : null,
                  k.isEmergencyContact ? "Yes" : "No",
                ]),
              },
            },
          ];
    case "supplierContacts":
      return data.supplierContacts.length === 0
        ? []
        : [
            {
              kind: "table",
              table: {
                title: "Supplier partner contacts",
                columns: ["Name / company", "Role", "Telephone / email"],
                rows: data.supplierContacts.map((s) => [
                  [person(s.contact), s.company].join("\n"),
                  s.role,
                  [s.contact.phone ? formatPhone(s.contact.phone) : null, s.contact.email].filter(Boolean).join("\n") || null,
                ]),
              },
            },
          ];
    case "emergencyContact": {
      const people = data.keyStaff.filter((k) => k.isEmergencyContact);
      return [
        {
          kind: "fields",
          items: [
            {
              label: def.label,
              required: true,
              value: people.length
                ? people.map((k) => [person(k.contact), k.contact.phone ? formatPhone(k.contact.phone) : null].filter(Boolean).join(" · ")).join("\n")
                : null,
            },
          ],
        },
      ];
    }
    case "fbAttendance": {
      const grid = data.fbGrid;
      if (grid.days.length === 0) return [{ kind: "note", text: "No catered functions with a meal type yet." }];
      return [
        {
          kind: "table",
          table: {
            title: def.label,
            columns: ["", ...grid.days.map((d) => formatDayDate(new Date(`${d}T12:00:00Z`), "UTC"))],
            numeric: [false, ...grid.days.map(() => true)],
            rows: ESG_FB_ROWS.map((r) => {
              const row = grid.rows.find((x) => x.key === r.key);
              return [r.label, ...grid.days.map((d) => (row?.cells[d] ? String(row.cells[d].expected) : null))];
            }),
          },
        },
      ];
    }
    case "signatories":
      return data.signatories.length === 0
        ? [{ kind: "note", text: "No authorized signatories recorded." }]
        : [
            {
              kind: "table",
              table: {
                columns: ["Full name", "Title", "Approval authority"],
                rows: data.signatories.map((k) => [person(k.contact), k.title, k.approvalAuthority]),
              },
            },
          ];
    case "housingBlocks": {
      const { housing } = data;
      if (housing.roomBlocks.length === 0) return [];
      const nights = Array.from(new Set(housing.roomBlocks.flatMap((b) => b.nights.map((n) => n.dateKey)))).sort();
      return [
        {
          kind: "table",
          table: {
            title: "Room block(s)",
            columns: ["Facility", "HQ hotel?", ...nights.map((d) => formatDayDate(new Date(`${d}T12:00:00Z`), "UTC"))],
            numeric: [false, false, ...nights.map(() => true)],
            rows: housing.roomBlocks.map((b) => [
              b.facilityName,
              b.isHq ? "Yes" : "No",
              ...nights.map((d) => {
                const n = b.nights.find((x) => x.dateKey === d);
                return n?.rooms != null ? String(n.rooms) : null;
              }),
            ]),
          },
        },
      ];
    }
    case "hotelConcessions":
      return data.hotelConcessions.length === 0
        ? []
        : [
            {
              kind: "table",
              table: {
                title: "Hotel concessions",
                columns: ["Hotel", "Concession", "Terms"],
                rows: data.hotelConcessions.flatMap((h) => h.items.map((c) => [h.hotel, c.label, c.terms])),
              },
            },
          ];
    case "exhibitBooths":
      return data.boothCount > 0 ? [{ kind: "fields", items: [{ label: "Number of exhibits", value: String(data.boothCount) }] }] : [];
    default: {
      const _exhaustive: never = def.source;
      throw new Error(`Unhandled derived source: ${_exhaustive}`);
    }
  }
}

function assembleNarrative(ctx: Ctx): EsgDocument["narrative"] {
  const na = new Set(ctx.data.spec?.naSections ?? []);
  const header = ESG_HEADER_FIELDS.map((f) => fieldItem(ctx, f));
  const sections: EsgSection[] = [];
  for (const section of ESG_SECTIONS) {
    if (BILLING_SECTIONS.has(section.letter) && !ctx.opts.includeBilling) continue;
    const blocks: EsgBlock[] = [];
    if (!na.has(section.letter)) {
      for (const d of section.derived ?? []) blocks.push(...derivedBlocks(ctx, d));
      push(blocks, fieldsBlock(section.fields.map((f) => fieldItem(ctx, f)), ctx.opts.showBlank));
      for (const g of section.grids ?? []) {
        const table = gridTable(ctx, g.grid, g.label);
        if (table) blocks.push({ kind: "table", table });
      }
    }
    if (blocks.length === 0 && !na.has(section.letter) && !ctx.opts.showBlank) continue;
    sections.push({ letter: section.letter, title: section.title, na: na.has(section.letter), blocks });
  }
  return { header, sections };
}

// ─── Parts II & IIIa ─────────────────────────────────────────────────────────

type Placement = {
  fn: EsgFunctionRow;
  number: string | null;
  name: string;
  roomId: string | null;
  facility: string | null;
  room: string | null;
  start: Date | null;
  end: Date | null;
};

function effectiveRooms(fn: EsgFunctionRow) {
  const byId = new Map<string, { id: string; name: string; venue: string }>();
  for (const gr of fn.breakoutGroup?.rooms ?? []) byId.set(gr.roomId, { id: gr.room.id, name: gr.room.name, venue: gr.room.venue.name });
  for (const o of fn.sessionRoomOverrides) {
    if (o.type === "exclude") byId.delete(o.roomId);
    else byId.set(o.roomId, { id: o.room.id, name: o.room.name, venue: o.room.venue.name });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function mainSchedules(fn: EsgFunctionRow, support: Set<string>) {
  const own = fn.schedules.filter((s) => !support.has(s.type));
  return own.length > 0 ? own : fn.schedules;
}

// Each function becomes one placement; a breakout block becomes one per room
// ("12a", "12b"), as the ESG treats each room as its own function.
function placements(fns: EsgFunctionRow[], support: Set<string>): Placement[] {
  const out: Placement[] = [];
  for (const fn of fns) {
    if (fn.status === "CANCELLED") continue;
    const main = mainSchedules(fn, support);
    const start = main[0]?.startTime ?? null;
    const end = main.length ? main.reduce((m, s) => (s.endTime > m ? s.endTime : m), main[0].endTime) : null;
    const name = formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name);
    if (fn.type === "BREAKOUT_BLOCK") {
      for (const r of effectiveRooms(fn)) {
        const suffix = fn.roomNumbers.find((rn) => rn.roomId === r.id)?.suffix;
        const slot = fn.presentationSlots.find((s) => s.roomId === r.id);
        out.push({
          fn,
          number: fn.functionNumber && suffix ? roomFunctionNumber(fn.functionNumber, suffix) : fn.functionNumber,
          name: slot ? `${name}: ${slot.presentation.title}` : name,
          roomId: r.id,
          facility: r.venue,
          room: r.name,
          start,
          end,
        });
      }
      continue;
    }
    out.push({
      fn,
      number: fn.functionNumber,
      name,
      roomId: fn.rooms[0]?.roomId ?? null,
      facility: fn.offSiteLocation ? fn.offSiteLocation : Array.from(new Set(fn.rooms.map((r) => r.room.venue.name))).join(", ") || null,
      room: fn.offSiteLocation ? "Off-site" : fn.rooms.map((r) => r.room.name).join(", ") || null,
      start,
      end,
    });
  }
  return out.sort(
    (a, b) =>
      (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity) ||
      compareFunctionNumbers(a.number, b.number) ||
      a.name.localeCompare(b.name),
  );
}

function setupOrdersFor(p: Placement) {
  const orders = p.fn.setupOrderFunctions.map((l) => l.setupOrder);
  if (p.roomId) {
    const inRoom = orders.filter((o) => o.room?.id === p.roomId);
    if (inRoom.length > 0) return inRoom;
  }
  return p.fn.type === "BREAKOUT_BLOCK" ? orders.filter((o) => !o.room) : orders;
}

function chairsFor(p: Placement): number | null {
  let total = 0;
  let any = false;
  for (const o of setupOrdersFor(p)) {
    for (const t of o.tables) {
      if (t.chairCount != null) {
        total += t.quantity * t.chairCount;
        any = true;
      }
    }
  }
  return any ? total : null;
}

function postingText(fn: EsgFunctionRow): string | null {
  if (fn.postToReaderBoard === null) return null;
  if (!fn.postToReaderBoard) return "Do not post";
  return fn.readerBoardText ? `Post as: ${fn.readerBoardText}` : "Post";
}

function scheduleRow(p: Placement, tz: string): EsgScheduleRow | null {
  if (!p.start || !p.end) return null;
  const setFor = p.fn.setForCount ?? chairsFor(p);
  return {
    dateKey: getDateKeyInTimezone(p.start, tz),
    dayDate: formatDayDate(p.start, tz),
    start: formatTimeDual(p.start, tz),
    end: formatTimeDual(p.end, tz),
    startIso: p.start.toISOString(),
    endIso: p.end.toISOString(),
    number: p.number,
    name: p.name,
    facility: p.facility,
    room: p.room,
    setup: setupOrdersFor(p).find((o) => o.setupType)?.setupType ?? null,
    setFor: setFor != null ? String(setFor) : null,
    posting: postingText(p.fn),
    hold24: p.fn.hold24Hour,
  };
}

function vendorsOf(links: { vendor: ProvidedByVendor }[]) {
  return links.map((l) => l.vendor);
}

// An order with no vendor yet is "provided by: unknown", not "not required";
// only the absence of any order reads as Not Required.
function providedByText(vendors: ProvidedByVendor[], hasOrder: boolean): string | null {
  if (!hasOrder) return PROVIDED_BY_LABELS.NOT_REQUIRED;
  return vendors.length ? formatProvidedBy(deriveProvidedBy(vendors)) : null;
}

function partyName(i: {
  providerVendor: { name: string } | null;
  providerContact: { firstName: string; lastName: string } | null;
}) {
  return partyLabel(i.providerVendor, i.providerContact);
}

function operatorName(i: {
  operatorVendor: { name: string } | null;
  operatorContact: { firstName: string; lastName: string } | null;
}) {
  return partyLabel(i.operatorVendor, i.operatorContact);
}

function money(v: { toFixed: (n: number) => string } | null): string | null {
  return v === null ? null : v.toFixed(2);
}

function setupOrderSections(p: Placement, ctx: Ctx): EsgSection[] {
  const { fn } = p;
  const { tz, opts, support, data } = ctx;
  const show = opts.showBlank;
  const sections: EsgSection[] = [];
  const add = (letter: string, title: string, blocks: (EsgBlock | null)[]) => {
    const kept = blocks.filter((b): b is EsgBlock => b !== null);
    if (kept.length > 0 || show) sections.push({ letter, title, na: false, blocks: kept });
  };

  // B. Function details
  const setupSched = fn.schedules.filter((s) => support.has(s.type));
  const setupBy = setupSched.filter((s) => s.startTime <= (p.start ?? s.startTime)).sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
  const dismantle = setupSched.filter((s) => p.end && s.startTime >= p.end).sort((a, b) => b.endTime.getTime() - a.endTime.getTime())[0];
  const catered = !!fn.cateringOrder;
  add("B", "Function Details", [
    fieldsBlock(
      [
        { label: "Function #", value: p.number },
        { label: "Function name", value: p.name },
        { label: "Function type", value: fn.type === "BREAKOUT_BLOCK" ? "Break Out" : fn.type || null },
        { label: "Post to reader board", value: postingText(fn) },
        { label: "Function location", value: [p.facility, p.room].filter(Boolean).join(" — ") || null },
        {
          label: "Key event personnel",
          value: fn.contacts.length ? fn.contacts.map((c) => [person(c.contact), c.role].filter(Boolean).join(", ")).join("\n") : null,
        },
        { label: "Attendance", value: fn.expectedAttendance != null ? String(fn.expectedAttendance) : null },
        { label: "Start", value: p.start ? formatDayDateTime(p.start, tz) : null },
        { label: "End", value: p.end ? formatDayDateTime(p.end, tz) : null },
        { label: "Set up by", value: setupBy ? formatDayDateTime(setupBy.startTime, tz) : null },
        { label: "Dismantle no later than", value: dismantle ? formatDayDateTime(dismantle.endTime, tz) : null },
        { label: "Catered function", value: catered ? "Yes" : "No" },
        { label: "24-hour hold", value: fn.hold24Hour ? "Yes" : "No" },
      ],
      show,
    ),
  ]);

  // C. Room set-up
  const orders = setupOrdersFor(p);
  const tables = orders.flatMap((o) => o.tables);
  const setupEquipment = orders.flatMap((o) => o.equipmentItems);
  const setFor = fn.setForCount ?? chairsFor(p);
  add("C", "Room Set-up", [
    fieldsBlock(
      [
        { label: "Room set-up diagram attached", value: orders.length ? (orders.some((o) => o.files.some((f) => f.fileType === "Diagram")) ? "Yes" : "No") : null },
        { label: "Room set for", value: setFor != null ? String(setFor) : null },
        { label: "Primary room set-up", value: orders.map((o) => o.setupType).filter(Boolean).join("; ") || null },
        { label: "Special requirements", value: orders.map((o) => o.notes).filter(Boolean).join("\n") || null },
      ],
      show,
    ),
    tables.length
      ? {
          kind: "table",
          table: {
            title: "Tables & chairs",
            columns: ["Qty", "Table", "Chairs per table", "Chair", "Provider", "Notes"],
            numeric: [true, false, true, false, false, false],
            rows: tables.map((t) => [String(t.quantity), t.tableType, t.chairCount != null ? String(t.chairCount) : null, t.chairType, t.providerVendor?.name ?? null, t.notes]),
          },
        }
      : null,
    ...orders.flatMap((o) =>
      o.details.map(
        (d): EsgBlock => ({ kind: "fields", items: [{ label: d.headline || "Set-up detail", value: null, html: d.description }] }),
      ),
    ),
    setupEquipment.length
      ? {
          kind: "table",
          table: {
            title: "Set-up equipment",
            columns: ["Item", "Qty", "Provider", "Notes"],
            numeric: [false, true, false, false],
            rows: setupEquipment.map((e) => [e.equipment?.name ?? e.item, e.quantity != null ? String(e.quantity) : null, partyName(e), e.notes]),
          },
        }
      : null,
  ]);

  // D. Audio/Visual
  const avOrders = fn.avOrderFunctions.map((l) => l.avOrder);
  const avRows: (string | null)[][] = [];
  for (const av of avOrders) {
    for (const g of av.audioSection?.inputGroups ?? []) {
      for (const i of g.inputItems) {
        avRows.push([`${i.equipment?.name ?? i.description}${g.name ? ` (${g.name})` : ""}`, i.quantity != null ? String(i.quantity) : null, partyName(i), operatorName(i), i.notes]);
      }
    }
    for (const m of av.audioSection?.monitorMixes ?? []) {
      avRows.push([`Monitor mix: ${m.equipment?.name ?? m.description ?? ""}`.trim(), null, partyName(m), operatorName(m), null]);
      for (const o of m.monitorOutputs) {
        avRows.push([`  ${o.equipment?.name ?? "Output"}`, o.quantity != null ? String(o.quantity) : null, partyName(o), operatorName(o), null]);
      }
    }
    for (const e of [...(av.videoSection?.equipmentItems ?? []), ...av.equipmentItems]) {
      avRows.push([e.equipment?.name ?? e.item, e.quantity != null ? String(e.quantity) : null, partyName(e), operatorName(e), e.notes]);
    }
  }
  if (avOrders.length > 0 || show) {
    add("D", "Audio / Visual", [
      fieldsBlock(
        [
          { label: "Provided by", value: providedByText(avOrders.flatMap((a) => vendorsOf(a.vendors)), avOrders.length > 0) },
          { label: "A/V comments", value: avOrders.map((a) => [a.notes, a.audioSection?.notes, a.videoSection?.notes].filter(Boolean).join("\n")).filter(Boolean).join("\n") || null },
        ],
        show,
      ),
      avRows.length
        ? { kind: "table", table: { columns: ["Item", "Qty", "Provider", "Operator", "Comments"], numeric: [false, true, false, false, false], rows: avRows } }
        : null,
    ]);
  }

  // E. Food & Beverage
  const co = fn.cateringOrder;
  if (co || show) {
    const count = co ? firmestGuestCount(co) : null;
    add("E", "Food & Beverage", [
      fieldsBlock(
        [
          { label: "Provided by", value: providedByText(co ? vendorsOf(co.vendors) : [], !!co) },
          { label: "F&B service time", value: co && p.start ? formatTimeDual(p.start, tz) : null },
          { label: "Anticipated attendance", value: co?.expectedCount != null ? String(co.expectedCount) : null },
          { label: "F&B guarantee", value: co?.guaranteeCount != null ? String(co.guaranteeCount) : null },
          { label: "Set for", value: co?.confirmedCount != null ? String(co.confirmedCount) : count ? String(count.value) : null },
          { label: "Meal type", value: co?.mealType ?? null },
          { label: "Service type", value: co?.serviceStyle ?? null },
          { label: "F&B comments", value: [co?.dietaryNotes, co?.notes].filter(Boolean).join("\n") || null },
        ],
        show,
      ),
      co && co.lineItems.length
        ? {
            kind: "table",
            table: {
              title: "F&B menu",
              columns: ["Description", "Quantity", "Price", "Per"],
              numeric: [false, true, true, false],
              rows: co.lineItems.map((li) => [li.description, li.quantity != null ? String(li.quantity) : null, money(li.unitPrice), li.unitType]),
            },
          }
        : null,
      ...(co?.menuSections ?? []).map(
        // HTML from RichTextEditor (menuContent).
        (ms): EsgBlock => ({ kind: "fields", items: [{ label: "Menu", value: ms.notes, html: ms.menuContent }] }),
      ),
    ]);
  }

  // F. Décor / G. Security
  add("F", "Décor", [fieldsBlock([{ label: "Décor instructions / requests", value: fn.decorNotes }], show)]);
  const keys = fn.specKeys;
  add("G", "Security", [
    fieldsBlock(
      [
        { label: "# of keys required", value: keys.length ? String(keys.reduce((n, k) => n + (k.quantity ?? 0), 0)) : null },
        { label: "Key(s) should be", value: keys.length ? (keys.some((k) => k.rekeyed) ? "Re-keyed" : "House / standard key") : null },
        { label: "Security instructions / requests", value: fn.securityNotes },
      ],
      show,
    ),
  ]);
  add("H", "Accessibility", [fieldsBlock([blankItem("Accessibility / special needs instructions")], show)]);

  // I. Entertainment / speaker
  const slots = p.roomId && fn.type === "BREAKOUT_BLOCK" ? fn.presentationSlots.filter((s) => s.roomId === p.roomId) : fn.presentationSlots;
  add("I", "Entertainment / Speaker", [
    fieldsBlock(
      [
        {
          label: "Speaker name(s)",
          value: slots.flatMap((s) => s.presentation.speakers.map((sp) => [person(sp.contact), sp.contact.organization].filter(Boolean).join(", "))).join("\n") || null,
        },
        { label: "Presentation(s)", value: slots.map((s) => s.presentation.title).join("\n") || null },
      ],
      show,
    ),
  ]);

  // J. Signage
  const prints = fn.printOrderFunctions.map((l) => l.printOrder);
  add("J", "Signage", [
    fieldsBlock(
      [
        ...(prints.length ? [{ label: "Provided by", value: providedByText(prints.flatMap((po) => vendorsOf(po.vendors)), true) }] : []),
        { label: "Signage instructions / requests", value: fn.signageNotes },
      ],
      show,
    ),
    prints.flatMap((po) => po.items).length
      ? {
          kind: "table",
          table: {
            title: "Print / signage items",
            columns: ["Item", "Qty", "Distribution", "Notes"],
            numeric: [false, true, false, false],
            rows: prints.flatMap((po) => po.items.map((i) => [i.description, i.quantity != null ? String(i.quantity) : null, i.distributionMethod, i.distributionNotes ?? i.notes])),
          },
        }
      : null,
  ]);

  // K. Transportation
  const transfers = fn.specTransfers;
  add("K", "Transportation", [
    transfers.length
      ? {
          kind: "table",
          table: {
            columns: ["Departs", "From", "Drop-off", "Return", "Provider"],
            rows: transfers.map((t) => [
              t.departureAt ? formatDayDateTime(t.departureAt, tz) : null,
              t.departureLocation,
              [t.dropoffLocation, t.dropoffAt ? formatTimeDual(t.dropoffAt, tz) : null].filter(Boolean).join(" · ") || null,
              [t.returnLocation, t.returnAt ? formatTimeDual(t.returnAt, tz) : null].filter(Boolean).join(" · ") || null,
              t.provider,
            ]),
          },
        }
      : fieldsBlock([blankItem("Transportation instructions / requests")], show),
  ]);
  add("L", "Shipping / Receiving", [fieldsBlock([blankItem("Shipping / receiving / mail instructions")], show)]);
  add("M", "Utilities", [fieldsBlock([blankItem("Electrical, telecommunications, cleaning and other utilities")], show)]);
  if (opts.includeBilling) {
    add("N", "Billing Instructions", [
      fieldsBlock(
        [
          { label: "Billing instructions", value: fn.billingNotes },
          { label: "Organizer cost center", value: fn.costCenter },
        ],
        show,
      ),
    ]);
  }

  // A. Event details lead every order.
  const contact = data.keyStaff[0];
  sections.unshift({
    letter: "A",
    title: "Event Details",
    na: false,
    blocks: [
      {
        kind: "fields",
        items: [
          { label: "Event name", value: data.event.name },
          { label: "Organizer / host organization", value: (data.narrative.hostOrgName as string) ?? null },
          { label: "Contact name", value: contact ? person(contact.contact) : null },
          { label: "Contact phone", value: contact?.contact.phone ? formatPhone(contact.contact.phone) : null },
        ],
      },
    ],
  });
  return sections;
}

// ─── Part IIIb ────────────────────────────────────────────────────────────────

function providedLabel(v: string | null): string | null {
  if (!v) return null;
  return v === "GROUP" ? "Booth to provide" : PROVIDED_BY_LABELS[v as keyof typeof PROVIDED_BY_LABELS];
}

// The booth with its group's settings in the blanks, its effective exhibit
// function, and the group's standard inventory ahead of its own.
function effectiveBooth(raw: EsgBoothRow) {
  const b = withGroupDefaults(raw, raw.group);
  return {
    ...b,
    function: raw.functionId ? raw.function : (raw.group?.function ?? null),
    equipmentItems: [...(raw.group?.equipmentItems ?? []), ...raw.equipmentItems],
  };
}

function boothOrder(raw: EsgBoothRow, ctx: Ctx): EsgSetupOrder {
  const { tz, opts, support, data } = ctx;
  const show = opts.showBlank;
  const b = effectiveBooth(raw);
  // Empty times follow the exhibit function's schedules.
  const fnScheds = b.function?.schedules ?? [];
  const own = fnScheds.filter((s) => !support.has(s.type));
  const main = own.length ? own : fnScheds;
  const setup = fnScheds.filter((s) => support.has(s.type));
  const start = b.startAt ?? (main.length ? main.reduce((m, s) => (s.startTime < m ? s.startTime : m), main[0].startTime) : null);
  const end = b.endAt ?? (main.length ? main.reduce((m, s) => (s.endTime > m ? s.endTime : m), main[0].endTime) : null);
  const setupBy = b.setupBy ?? (setup.length && start ? setup.filter((s) => s.startTime <= start).sort((x, y) => x.startTime.getTime() - y.startTime.getTime())[0]?.startTime ?? null : null);
  const teardown = b.teardownBy ?? (setup.length && end ? setup.filter((s) => s.startTime >= end).sort((x, y) => y.endTime.getTime() - x.endTime.getTime())[0]?.endTime ?? null : null);
  const dt = (d: Date | null) => (d ? formatDayDateTime(d, tz) : null);
  const yn = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");
  const sections: EsgSection[] = [];
  const add = (letter: string, title: string, blocks: (EsgBlock | null)[]) => {
    const kept = blocks.filter((x): x is EsgBlock => x !== null);
    if (kept.length > 0 || show) sections.push({ letter, title, na: false, blocks: kept });
  };
  const contact = data.keyStaff[0];
  sections.push({
    letter: "A",
    title: "Event Details",
    na: false,
    blocks: [
      {
        kind: "fields",
        items: [
          { label: "Event name", value: data.event.name },
          { label: "Organizer / host organization", value: (data.narrative.hostOrgName as string) ?? null },
          { label: "Contact name", value: contact ? person(contact.contact) : null },
          { label: "Contact phone", value: contact?.contact.phone ? formatPhone(contact.contact.phone) : null },
        ],
      },
    ],
  });
  add("B", "Booth Details", [
    fieldsBlock(
      [
        { label: "Booth #", value: b.boothNumber },
        { label: "Booth location", value: b.location },
        { label: "Booth type", value: b.boothType },
        { label: "Booth name", value: b.name },
        { label: "Company name", value: b.companyName },
        {
          label: "Key contact person for booth",
          value: b.contact ? [person(b.contact), b.contact.phone ? formatPhone(b.contact.phone) : null, b.contact.email].filter(Boolean).join(" · ") : null,
        },
        { label: "Booth start", value: dt(start) },
        { label: "Booth end", value: dt(end) },
        { label: "Set up by", value: dt(setupBy) },
        { label: "Tear down no later than", value: dt(teardown) },
      ],
      show,
    ),
  ]);
  add("C", "Booth Set-up", [
    b.equipmentItems.length
      ? {
          kind: "table",
          table: {
            title: "Inventory needed",
            columns: ["Description", "Qty", "Provider", "Comments"],
            numeric: [false, true, false, false],
            rows: b.equipmentItems.map((e) => [e.equipment?.name ?? e.item, e.quantity != null ? String(e.quantity) : null, partyName(e), e.notes]),
          },
        }
      : null,
    fieldsBlock(
      [
        { label: "Special requirements", value: b.specialRequirements },
        { label: "Booth set-up comments", value: b.setupNotes },
      ],
      show,
    ),
  ]);
  add("D", "Audio / Visual", [fieldsBlock([{ label: "Provided by", value: providedLabel(b.avProvider) }, { label: "A/V comments", value: b.avNotes }], show)]);
  add("E", "Food & Beverage", [fieldsBlock([{ label: "F&B comments", value: b.fbNotes }], show)]);
  add("F", "Décor", [fieldsBlock([{ label: "Décor instructions / requests", value: b.decorNotes }], show)]);
  add("G", "Security", [fieldsBlock([{ label: "Security instructions / requests", value: b.securityNotes }], show)]);
  add("H", "Accessibility", [fieldsBlock([blankItem("Accessibility / special needs instructions")], show)]);
  add("I", "Entertainment / Speaker", [fieldsBlock([blankItem("Entertainment / speaker instructions")], show)]);
  add("J", "Signage", [fieldsBlock([{ label: "Signage instructions / requests", value: b.signageNotes }], show)]);
  add("K", "Material Handling", [
    fieldsBlock(
      [
        { label: "Shipping / receiving required", value: yn(b.shippingRequired) },
        { label: "Customs / brokerage", value: yn(b.customsRequired) },
        { label: "Material handling instructions", value: b.materialHandlingNotes },
      ],
      show,
    ),
  ]);
  add("L", "Utilities", [
    fieldsBlock(
      [
        { label: "Electrical connections", value: providedLabel(b.electricalProvider) },
        { label: "Electrical notes", value: b.electricalNotes },
        { label: "Other utilities", value: b.utilitiesNotes },
      ],
      show,
    ),
  ]);
  if (opts.includeBilling) {
    add("N", "Billing Instructions", [
      fieldsBlock(
        [
          { label: "Booth is tax-exempt", value: yn(b.taxExempt) },
          { label: "Tax-exempt ID #", value: b.taxExemptId },
          { label: "Booth cost center", value: b.costCenter },
          { label: "Billing instructions", value: b.billingNotes },
        ],
        show,
      ),
    ]);
  }
  return {
    anchor: `booth-${b.id}`,
    number: b.boothNumber,
    name: [b.name, b.companyName && b.companyName !== b.name ? b.companyName : null].filter(Boolean).join(" — "),
    dateKey: start ? getDateKeyInTimezone(start, tz) : null,
    sections,
  };
}

export function assembleEsgDocument(
  data: EsgNarrativeData,
  functions: EsgFunctionRow[],
  booths: EsgBoothRow[],
  support: Set<string>,
  opts: EsgOptions,
): EsgDocument {
  const tz = data.event.timezone;
  const ctx: Ctx = { data, tz, opts, support };
  const contact = data.keyStaff[0];
  const days = opts.days?.length ? new Set(opts.days) : null;
  const fnIds = opts.functionIds?.length ? new Set(opts.functionIds) : null;

  const all = placements(functions, support);
  const inDays = all.filter((p) => !days || (p.start && days.has(getDateKeyInTimezone(p.start, tz))));

  const functionSchedule = opts.parts.includes("II")
    ? inDays.map((p) => scheduleRow(p, tz)).filter((r): r is EsgScheduleRow => r !== null)
    : null;

  const setupOrders: EsgSetupOrder[] | null = opts.parts.includes("IIIa")
    ? inDays
        .filter((p) => !fnIds || fnIds.has(p.fn.id))
        .map((p) => ({
          anchor: `function-${p.fn.id}${p.roomId && p.fn.type === "BREAKOUT_BLOCK" ? `-${p.roomId}` : ""}`,
          number: p.number,
          name: p.name,
          dateKey: p.start ? getDateKeyInTimezone(p.start, tz) : null,
          sections: setupOrderSections(p, ctx),
        }))
    : null;

  return {
    meta: {
      eventId: data.event.id,
      eventName: data.event.name,
      organizer: (data.narrative.hostOrgName as string) ?? null,
      contactName: contact ? person(contact.contact) : null,
      contactPhone: contact?.contact.phone ? formatPhone(contact.contact.phone) : null,
      dateOriginated: formatDateOnly(data.spec?.dateOriginated),
      dateRevised: formatDateOnly(data.spec?.dateRevised),
      generatedAt: formatDayDateTime(new Date(), tz),
      timezone: tz,
      eventDates: `${formatEventDate(data.event.startDate, tz)} – ${formatEventDate(data.event.endDate, tz)}`,
    },
    parts: opts.parts,
    narrative: opts.parts.includes("I") ? assembleNarrative(ctx) : null,
    functionSchedule,
    setupOrders,
    boothOrders: opts.parts.includes("IIIb")
      ? booths
          .filter((b) => {
            const functionId = b.functionId ?? b.group?.functionId ?? null;
            return !fnIds || (functionId !== null && fnIds.has(functionId));
          })
          .sort(
            (x, y) =>
              (x.boothNumber ?? "").localeCompare(y.boothNumber ?? "", undefined, { numeric: true }) || x.name.localeCompare(y.name),
          )
          .map((b) => boothOrder(b, ctx))
      : null,
    attribution: APEX_ATTRIBUTION,
  };
}

// Distinct days present in Part II / IIIa, for the report's day filter.
export function esgDayOptions(functions: EsgFunctionRow[], support: Set<string>, tz: string): string[] {
  const keys = new Set<string>();
  for (const fn of functions) {
    const k = functionStartKey(fn.schedules, support);
    if (k !== null) keys.add(getDateKeyInTimezone(new Date(k), tz));
  }
  return Array.from(keys).sort();
}
