// .xlsx rendering of the ESG / PER documents (server-only; lazy-imported by
// the download route). Part II is a real data sheet (date / time / number
// cells, frozen header, autofilter); narrative and set-up orders are
// Section | Field | Value sheets with each grid written in place, numeric
// grid columns as number cells.

import ExcelJS from "exceljs";
import { htmlToPlainText } from "@/lib/esg/richText";
import type { EsgDocument, EsgItem, EsgScheduleRow, EsgSection, EsgSetupOrder } from "@/lib/esg/types";
import type { PerDocument } from "@/lib/esg/per";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
const TITLE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };

// Excel has no time zones: a cell's date/time is shown as stored. Build a
// Date whose UTC parts are the event-local wall clock.
function localWallClock(iso: string, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")));
}

// "1,250" / "$1,250.00" / "42" → number; anything else stays text.
function asNumber(v: string | null): number | string | null {
  if (v == null || v === "") return null;
  const cleaned = v.replace(/[$,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : v;
}

function itemText(item: EsgItem): string | null {
  const parts = [item.html ? htmlToPlainText(item.html) : null, item.value].filter((p): p is string => !!p);
  return parts.length ? parts.join("\n") : null;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });
}

// One sheet of Section | Field | Value rows; grids are written in place
// beneath their section, header row shaded, starting in the Field column.
function sectionSheet(wb: ExcelJS.Workbook, name: string, groups: { title?: string; sections: EsgSection[] }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = [{ width: 28 }, { width: 34 }, { width: 70 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  const header = ws.addRow(["Section", "Field", "Value"]);
  styleHeader(header);
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const g of groups) {
    if (g.title) {
      const r = ws.addRow([g.title]);
      r.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      for (let i = 1; i <= 3; i++) r.getCell(i).fill = TITLE_FILL;
    }
    for (const s of g.sections) {
      const label = `${s.letter}. ${s.title}`;
      const sr = ws.addRow([label, s.na ? "Not applicable" : null]);
      sr.font = { bold: true };
      for (let i = 1; i <= 3; i++) sr.getCell(i).fill = SECTION_FILL;
      if (s.na) continue;
      for (const block of s.blocks) {
        switch (block.kind) {
          case "fields":
            for (const item of block.items) {
              const r = ws.addRow([label, `${item.label}${item.required ? " *" : ""}`, itemText(item)]);
              r.getCell(3).alignment = { wrapText: true, vertical: "top" };
              r.getCell(1).font = { color: { argb: "FF808080" } };
            }
            break;
          case "table": {
            const t = block.table;
            if (t.title) ws.addRow([label, t.title]).getCell(2).font = { bold: true, italic: true };
            const hr = ws.addRow([label, ...t.columns]);
            hr.getCell(1).font = { color: { argb: "FF808080" } };
            for (let i = 2; i <= t.columns.length + 1; i++) {
              hr.getCell(i).font = { bold: true };
              hr.getCell(i).fill = HEADER_FILL;
            }
            for (const row of t.rows) {
              const r = ws.addRow([label, ...row.map((v, i) => (t.numeric?.[i] ? asNumber(v) : v))]);
              r.getCell(1).font = { color: { argb: "FF808080" } };
              r.eachCell((c, col) => {
                if (col > 1) c.alignment = { wrapText: true, vertical: "top" };
              });
            }
            break;
          }
          case "note":
            ws.addRow([label, null, block.text]).getCell(3).font = { italic: true, color: { argb: "FF666666" } };
            break;
          default: {
            const _exhaustive: never = block;
            throw new Error(`Unhandled block: ${JSON.stringify(_exhaustive)}`);
          }
        }
      }
    }
  }
  return ws;
}

function scheduleSheet(wb: ExcelJS.Workbook, rows: EsgScheduleRow[], timeZone: string) {
  const ws = wb.addWorksheet("Function Schedule");
  ws.columns = [
    { header: "Date", key: "date", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: "Day", key: "day", width: 22 },
    { header: "Start", key: "start", width: 10, style: { numFmt: "h:mm AM/PM" } },
    { header: "End", key: "end", width: 10, style: { numFmt: "h:mm AM/PM" } },
    { header: "Start (24h)", key: "start24", width: 11, style: { numFmt: "hh:mm" } },
    { header: "End (24h)", key: "end24", width: 11, style: { numFmt: "hh:mm" } },
    { header: "Function #", key: "number", width: 11 },
    { header: "Function name", key: "name", width: 40 },
    { header: "Facility", key: "facility", width: 26 },
    { header: "Room", key: "room", width: 24 },
    { header: "Set-up", key: "setup", width: 20 },
    { header: "Set for", key: "setFor", width: 9 },
    { header: "Posting", key: "posting", width: 30 },
    { header: "24-hr hold", key: "hold", width: 10 },
  ];
  for (const r of rows) {
    const start = localWallClock(r.startIso, timeZone);
    const end = localWallClock(r.endIso, timeZone);
    const [y, m, d] = r.dateKey.split("-").map(Number);
    ws.addRow({
      date: new Date(Date.UTC(y, m - 1, d)),
      day: r.dayDate,
      start,
      end,
      start24: start,
      end24: end,
      number: r.number,
      name: r.name,
      facility: r.facility,
      room: r.room,
      setup: r.setup,
      setFor: asNumber(r.setFor),
      posting: r.posting,
      hold: r.hold24 ? "Yes" : "No",
    });
  }
  styleHeader(ws.getRow(1));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
}

function orderGroups(orders: EsgSetupOrder[], prefix: string) {
  return orders.map((o) => ({ title: `${o.number ? `${prefix}${o.number} · ` : ""}${o.name}`, sections: o.sections }));
}

function aboutSheet(wb: ExcelJS.Workbook, title: string, rows: [string, string | null][], attribution: string) {
  const ws = wb.addWorksheet("About");
  ws.columns = [{ width: 22 }, { width: 80 }];
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 16 };
  for (const [k, v] of rows) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
  ws.addRow([]);
  ws.addRow([attribution]).getCell(1).font = { italic: true, color: { argb: "FF666666" } };
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function renderEsgXlsx(doc: EsgDocument): Promise<Buffer> {
  const { meta } = doc;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Event Manager";
  wb.title = `${meta.eventName} — Event Specifications Guide`;
  aboutSheet(
    wb,
    "Event Specifications Guide",
    [
      ["Event", meta.eventName],
      ["Dates", meta.eventDates],
      ["Organizer / host", meta.organizer],
      ["Contact", [meta.contactName, meta.contactPhone].filter(Boolean).join(" · ") || null],
      ["Date originated", meta.dateOriginated],
      ["Date revised", meta.dateRevised],
      ["Time zone", meta.timezone],
      ["Generated", meta.generatedAt],
    ],
    doc.attribution,
  );
  if (doc.narrative) sectionSheet(wb, "Part I Narrative", [{ sections: doc.narrative.sections }]);
  if (doc.functionSchedule) scheduleSheet(wb, doc.functionSchedule, meta.timezone);
  if (doc.setupOrders) sectionSheet(wb, "Part IIIa Set-up Orders", orderGroups(doc.setupOrders, "#"));
  if (doc.boothOrders) sectionSheet(wb, "Part IIIb Booths", orderGroups(doc.boothOrders, "Booth "));
  return toBuffer(wb);
}

export async function renderPerXlsx(doc: PerDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Event Manager";
  wb.title = `${doc.meta.eventName} — Post-Event Report`;
  aboutSheet(
    wb,
    "Post-Event Report",
    [
      ["Event", doc.meta.eventName],
      ["Dates", doc.meta.eventDates],
      ["Time zone", doc.meta.timezone],
      ["Generated", doc.meta.generatedAt],
    ],
    `${doc.attribution} Reproduced ${doc.meta.generatedAt}.`,
  );
  sectionSheet(wb, "Post-Event Report", [{ sections: doc.sections }]);
  return toBuffer(wb);
}
