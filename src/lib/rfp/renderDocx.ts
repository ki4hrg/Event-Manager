// .docx rendering of an RFP document (server-only; lazy-imported by the
// download route and by Issue). Same look as the ESG: the primitives come
// from src/lib/esg/renderDocx.ts.

import { Document, HeadingLevel, Packer, PageOrientation, Paragraph, TextRun, type Table } from "docx";
import { FONT, chrome, fieldsTable, gridTable, numbering, richParagraphs, spacer, styles, textParagraphs } from "@/lib/esg/renderDocx";
import { formatNight } from "@/lib/hotels";
import type { RfpBlockDoc, RfpDocument, RfpFact, RfpSpaceDay } from "@/lib/rfp/document";
import { comparisonRows, type RfpComparison } from "@/lib/rfp/compare";

const heading = (text: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun({ text, font: FONT })] });

const subheading = (text: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text, font: FONT })] });

const note = (text: string) => new Paragraph({ children: [new TextRun({ text, italics: true, size: 18, color: "666666", font: FONT })] });

const label = (text: string) =>
  new Paragraph({ keepNext: true, spacing: { before: 80, after: 40 }, children: [new TextRun({ text, bold: true, size: 20, font: FONT })] });

const num = (n: number | null) => (n == null ? "" : String(Math.round(n)));

const facts = (items: RfpFact[]) => (items.length ? [fieldsTable(items.map((f) => ({ label: f.label, value: f.value }))), spacer()] : []);

function blockTable(b: RfpBlockDoc): Table {
  const multi = b.roomTypes.length > 1;
  return gridTable({
    columns: ["Night", ...b.roomTypes, ...(multi ? ["Total"] : [])],
    numeric: [false, ...b.roomTypes.map(() => true), ...(multi ? [true] : [])],
    rows: b.nights.map((k) => [formatNight(k), ...b.roomTypes.map((t) => num(b.cells[k]?.[t] ?? 0)), ...(multi ? [num(b.totals[k])] : [])]),
  });
}

function spaceTable(days: RfpSpaceDay[], fb: boolean): Table {
  const anyRoom = days.some((d) => d.rows.some((r) => r.room));
  const anyAv = days.some((d) => d.rows.some((r) => r.av));
  const columns = [
    "Day",
    "Time",
    fb ? "Meal" : "Function",
    "Type",
    ...(fb ? [] : ["Set-up"]),
    "Attendees",
    ...(fb ? [] : ["Sq ft", "24-hr hold"]),
    ...(anyAv ? ["A/V"] : []),
    ...(anyRoom ? ["Room"] : []),
  ];
  return gridTable({
    columns,
    numeric: columns.map((c) => c === "Attendees" || c === "Sq ft"),
    rows: days.flatMap((d) =>
      d.rows.map((r, i) => [
        i === 0 ? d.label : "",
        r.time,
        r.name,
        r.type,
        ...(fb ? [] : [r.setup]),
        num(r.attendance),
        ...(fb ? [] : [num(r.areaSqFt), r.hold24 ? "Yes" : ""]),
        ...(anyAv ? [r.av] : []),
        ...(anyRoom ? [r.room] : []),
      ]),
    ),
  });
}

// A fill-in table for the hotel's response: labelled rows, empty cells.
const blankTable = (columns: string[], rows: string[][]) => gridTable({ columns, rows: rows.map((r) => columns.map((_, i) => r[i] ?? "")) });

// Elements for the document body, in APEX Single Facility RFP order.
export function rfpBodyElements(doc: RfpDocument): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(heading("I. Contact information"));
  out.push(
    ...facts([
      {
        label: "Key contact",
        value: doc.contact ? [doc.contact.name, doc.contact.title, doc.contact.organization, doc.contact.email, doc.contact.phone].filter(Boolean).join("\n") : "—",
      },
      ...(doc.host ? [{ label: "Host organization", value: [doc.host.name, doc.host.address, doc.host.phone, doc.host.website].filter(Boolean).join("\n") }] : []),
    ]),
  );

  out.push(heading("II. Event profile"), ...facts(doc.profile.facts));
  for (const [title, html] of [
    ["Host overview", doc.profile.overview],
    ["Event objectives", doc.profile.objectives],
    ["Attendee profile", doc.profile.demographics],
    ["Accessibility / special needs", doc.profile.accessibility],
  ] as const) {
    if (html) out.push(subheading(title), ...richParagraphs(html), spacer());
  }
  if (doc.history) {
    out.push(subheading("Event history"));
    if (doc.history.length === 0) out.push(note("No past events with room pickup."));
    else
      out.push(
        gridTable({
          columns: ["Event", "Facility", "City", "Start", "End", "Attendance", "Room nights", "Peak night", "Pickup"],
          numeric: [false, false, false, false, false, true, true, true, true],
          rows: doc.history.map((h) => [
            h.name,
            h.facility,
            h.city,
            h.start,
            h.end,
            num(h.attendance),
            num(h.roomNights),
            num(h.peak),
            h.pickupPercent != null ? `${h.pickupPercent}%` : "",
          ]),
        }),
        spacer(),
      );
  }

  out.push(heading("III. Requirements"));
  if (doc.statementOfNeed) out.push(subheading("Statement of need"), ...richParagraphs(doc.statementOfNeed), spacer());
  out.push(
    subheading("Dates"),
    ...facts([
      ...(doc.dates.preferred ? [{ label: "Preferred dates", value: doc.dates.preferred }] : []),
      ...doc.dates.alternates.map((a, i) => ({ label: `Alternate dates ${i + 1}`, value: a })),
      { label: "Dates flexible", value: doc.dates.flexible ? "Yes" : "No" },
    ]),
  );
  if (doc.dates.notes) out.push(...textParagraphs(doc.dates.notes), spacer());
  if (doc.facility.length) out.push(subheading("Facility requirements"), ...facts(doc.facility));
  if (doc.blocks) {
    out.push(subheading("Guest room block"));
    if (doc.blocks.length === 0) out.push(note("No room blocks requested."));
    for (const b of doc.blocks) {
      out.push(label(b.label));
      if (b.nights.length) out.push(blockTable(b), note(`Rooms on peak night ${b.peak} · ${b.roomNights} room nights`));
      if (b.targetRate) out.push(...textParagraphs(`Room rate must be no more than ${b.targetRate}`, { size: 18 }));
      if (b.notes) out.push(...textParagraphs(b.notes, { size: 18 }));
      out.push(spacer());
    }
    out.push(...facts(doc.roomTerms));
  }
  if (doc.amenities.length) out.push(subheading("Requested amenities"), ...textParagraphs(doc.amenities.join(" · ")), spacer());
  if (doc.meetingSpace) {
    out.push(subheading("Function space"));
    out.push(...(doc.meetingSpace.length ? [spaceTable(doc.meetingSpace, false), spacer()] : [note("No function space requested.")]));
  }
  if (doc.fb) {
    out.push(subheading("Food & beverage"));
    if (doc.fb.days.length) out.push(spaceTable(doc.fb.days, true), spacer());
    else if (!doc.fb.terms.length) out.push(note("No food & beverage requested."));
    out.push(...facts(doc.fb.terms));
  }
  if (doc.concessions) {
    out.push(subheading("Concessions desired"));
    if (doc.concessions.length === 0) out.push(note("None listed."));
    for (const g of doc.concessions) {
      out.push(
        label(g.group),
        gridTable({ columns: ["Concession", "Requested", "Required"], rows: g.items.map((c) => [c.label, c.value, c.required ? "Required" : ""]) }),
        spacer(),
      );
    }
  }
  if (doc.requirements) out.push(subheading("Other requirements"), ...richParagraphs(doc.requirements), spacer());

  out.push(heading("IV. Proposal specifications"), ...textParagraphs("Direct questions to the key contact in section I."), spacer());
  out.push(...facts(doc.specs.filter((f) => f.label !== "Questions to")));
  if (doc.attachments.length) out.push(subheading("Attachments"), ...doc.attachments.flatMap((a) => textParagraphs(`• ${a}`)), spacer());

  if (doc.responseForm) {
    const r = doc.responseForm;
    out.push(heading("V. Proposal content"), ...textParagraphs("Please include the following in your proposal."), spacer());
    if (r.roomTypes.length) out.push(subheading("Dates & guest rooms"), blankTable(["Room type", "Rate", "Rooms available", "Notes"], r.roomTypes.map((t) => [t])), spacer());
    if (r.meetingSpace.length)
      out.push(
        subheading("Function space"),
        blankTable(
          ["Day", "Time", "Function", "Set-up", "Room", "Capacity for set-up", "24-hr hold available"],
          r.meetingSpace.map((m) => [m.day, m.time, m.name, m.setup ?? ""]),
        ),
        spacer(),
      );
    out.push(
      subheading("Food & beverage"),
      blankTable(["F&B function", "Average per-person price"], [...r.mealTypes.map((m) => [m]), ["Standard tax %"], ["Standard service charge %"]]),
      spacer(),
    );
    if (r.concessions.length) out.push(subheading("Concessions offered"), blankTable(["Concession", "Offered"], r.concessions.map((c) => [c])), spacer());
  }

  return out;
}

export function rfpFileName(eventName: string, title: string) {
  return `${`${eventName} - ${title}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim()}.docx`;
}

export async function renderRfpDocx(doc: RfpDocument): Promise<Buffer> {
  const { meta } = doc;
  const head = chrome(meta.title, meta.eventName, meta.issuedOn ? `Issued ${meta.issuedOn}` : "", "");
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: meta.title, font: FONT, size: 40, bold: true })] }),
    fieldsTable([
      { label: "Event", value: `${meta.eventName}\n${meta.eventDates}` },
      ...(doc.contact ? [{ label: "Respond to", value: doc.contact.name }] : []),
      ...(meta.responseDue ? [{ label: "Proposal due", value: meta.responseDue }] : []),
    ]),
    spacer(),
    ...rfpBodyElements(doc),
  ];
  return Packer.toBuffer(
    new Document({ creator: "Event Manager", title: `${meta.eventName} — ${meta.title}`, numbering, styles, sections: [{ ...head, properties: {}, children }] }),
  );
}

// Bid comparison: one landscape table per requested block, a column per
// hotel. Cells short of the request are marked "▼".
export async function renderRfpCompareDocx(data: RfpComparison): Promise<Buffer> {
  const title = `${data.title} — Bid comparison`;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: FONT, size: 36, bold: true })] }),
  ];
  for (const g of data.groups) {
    children.push(heading(g.label));
    if (g.requested) {
      children.push(
        note(
          `Requested ${g.requested.roomNights} room nights · peak ${g.requested.peak}${g.requested.targetRate != null ? ` · target $${g.requested.targetRate.toFixed(2)}` : ""}`,
        ),
      );
    }
    if (g.offers.length === 0) {
      children.push(note("No proposals yet."), spacer());
      continue;
    }
    const rows = comparisonRows(g, data.concessions, data.amenities);
    children.push(
      gridTable({
        columns: ["", ...(g.requested ? ["Requested"] : []), ...g.offers.map((o) => o.hotel)],
        numeric: [false, ...(g.requested ? [true] : []), ...g.offers.map(() => true)],
        rows: rows.map((r) => [r.label, ...(g.requested ? [r.requested] : []), ...r.cells.map((c) => (c.short ? `▼ ${c.text}` : c.text))]),
      }),
      spacer(),
    );
  }
  if (data.groups.some((g) => g.offers.length)) children.push(note("▼ falls short of the request."));
  const head = chrome("Bid comparison", data.eventName, data.title, "");
  return Packer.toBuffer(
    new Document({
      creator: "Event Manager",
      title: `${data.eventName} — ${title}`,
      numbering,
      styles,
      sections: [{ ...head, properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children }],
    }),
  );
}
