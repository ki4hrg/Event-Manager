// .docx rendering of an RFP document (server-only; lazy-imported by the
// download route and by Issue). Same look as the ESG: the primitives come
// from src/lib/esg/renderDocx.ts.

import { Document, HeadingLevel, Packer, PageOrientation, Paragraph, TextRun, type Table } from "docx";
import { FONT, chrome, fieldsTable, gridTable, numbering, richParagraphs, spacer, styles, textParagraphs } from "@/lib/esg/renderDocx";
import { formatNight } from "@/lib/hotels";
import type { RfpDocument } from "@/lib/rfp/document";
import { comparisonRows, type RfpComparison } from "@/lib/rfp/compare";

const heading = (text: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text, font: FONT })] });

const note = (text: string) => new Paragraph({ children: [new TextRun({ text, italics: true, size: 18, color: "666666", font: FONT })] });

const num = (n: number | null) => (n == null ? "" : String(Math.round(n)));

// Elements for every part that is on, in document order.
export function rfpBodyElements(doc: RfpDocument): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  if (doc.introduction) out.push(...richParagraphs(doc.introduction), spacer());

  if (doc.blocks) {
    out.push(heading("Room blocks"));
    if (doc.blocks.length === 0) out.push(note("No room blocks requested."));
    for (const b of doc.blocks) {
      out.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({ text: b.label, bold: true, size: 20, font: FONT }),
            new TextRun({
              text: [`Peak ${b.peak}`, `${b.roomNights} room nights`, b.targetRate ? `Target rate ${b.targetRate}` : null]
                .filter(Boolean)
                .map((t) => ` · ${t}`)
                .join(""),
              size: 18,
              color: "404040",
              font: FONT,
            }),
          ],
        }),
      );
      if (b.nights.length) {
        out.push(
          gridTable({
            columns: ["Room type", ...b.nights.map(formatNight)],
            numeric: [false, ...b.nights.map(() => true)],
            rows: [
              ...b.rows.map((r) => [r.roomType, ...b.nights.map((k) => num(r.rooms[k] ?? 0))]),
              ...(b.rows.length > 1 ? [["Total", ...b.nights.map((k) => num(b.totals[k]))]] : []),
            ],
          }),
        );
      }
      if (b.notes) out.push(...textParagraphs(b.notes, { size: 18 }));
      out.push(spacer());
    }
  }

  if (doc.meetingSpace) {
    out.push(heading("Meeting space"));
    const { rows, showRoomNames } = doc.meetingSpace;
    if (rows.length === 0) out.push(note("No on-site functions scheduled."));
    else
      out.push(
        gridTable({
          columns: ["Date", "Time", "Function", "Type", "Set-up", "Attendance", "24-hr hold", ...(showRoomNames ? ["Room"] : [])],
          numeric: [false, false, false, false, false, true, false, false],
          rows: rows.map((r) => [
            formatNight(r.date),
            r.time,
            r.name,
            r.type,
            r.setup,
            num(r.attendance),
            r.hold24 ? "Yes" : "",
            ...(showRoomNames ? [r.room] : []),
          ]),
        }),
        spacer(),
      );
  }

  if (doc.fb) {
    out.push(heading("Food & beverage"));
    const active = doc.fb.rows.filter((r) => Object.keys(r.cells).length > 0);
    if (active.length === 0) out.push(note("No catered functions."));
    else
      out.push(
        gridTable({
          columns: ["Meal", ...doc.fb.days.map(formatNight)],
          numeric: [false, ...doc.fb.days.map(() => true)],
          rows: active.map((r) => [r.label, ...doc.fb!.days.map((d) => (r.cells[d] ? num(r.cells[d].expected) : ""))]),
        }),
        note("Expected attendance per meal."),
        spacer(),
      );
  }

  if (doc.concessions) {
    out.push(heading("Concessions"));
    if (doc.concessions.length === 0) out.push(note("None listed."));
    else
      out.push(
        gridTable({
          columns: ["Concession", "Requested", "Required"],
          rows: doc.concessions.map((c) => [c.label, c.value, c.required ? "Required" : ""]),
        }),
        spacer(),
      );
  }

  if (doc.history) {
    out.push(heading("Event history"));
    if (doc.history.length === 0) out.push(note("No past events with room pickup."));
    else
      out.push(
        gridTable({
          columns: ["Event", "Dates", "Attendance", "Peak night", "Room nights", "Blocked", "Pickup"],
          numeric: [false, false, true, true, true, true, true],
          rows: doc.history.map((h) => [
            h.name,
            h.dates,
            num(h.attendance),
            num(h.peak),
            num(h.roomNights),
            num(h.blockedNights),
            h.pickupPercent != null ? `${h.pickupPercent}%` : "",
          ]),
        }),
        spacer(),
      );
  }

  if (doc.requirements) out.push(heading("Additional requirements"), ...richParagraphs(doc.requirements));

  return out;
}

export function rfpFileName(eventName: string, title: string) {
  return `${`${eventName} - ${title}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim()}.docx`;
}

export async function renderRfpDocx(doc: RfpDocument): Promise<Buffer> {
  const { meta } = doc;
  const head = chrome(meta.title, meta.eventName, meta.issuedOn ? `Issued ${meta.issuedOn}` : "", "");
  const contact = meta.contact
    ? [meta.contact.name, meta.contact.title, meta.contact.organization, meta.contact.email, meta.contact.phone].filter(Boolean).join("\n")
    : null;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: meta.title, font: FONT, size: 40, bold: true })] }),
    fieldsTable([
      { label: "Event", value: `${meta.eventName}\n${meta.eventDates}` },
      ...(meta.location ? [{ label: "Location", value: meta.location }] : []),
      ...(meta.expectedAttendance != null ? [{ label: "Expected attendance", value: String(meta.expectedAttendance) }] : []),
      { label: "Responses due", value: meta.responseDue },
      ...(meta.decisionBy ? [{ label: "Decision by", value: meta.decisionBy }] : []),
      { label: "Contact", value: contact },
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
    const rows = comparisonRows(g, data.concessions);
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
