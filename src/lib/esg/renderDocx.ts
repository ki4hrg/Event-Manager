// .docx rendering of the ESG / PER documents (server-only; lazy-imported by
// the download route). A structured equivalent of the APEX forms, not a
// facsimile: one key/value table per section, real tables for grids, Part II
// on a landscape page, a page break before each set-up / booth order. The
// exported primitives are shared with src/lib/rfp/renderDocx.ts.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from "docx";
import { htmlToBlocks, type RichRun } from "@/lib/esg/richText";
import type { EsgBlock, EsgDocument, EsgItem, EsgScheduleRow, EsgSection, EsgSetupOrder, EsgTable } from "@/lib/esg/types";
import type { PerDocument } from "@/lib/esg/per";

export const FONT = "Calibri";
const BULLETS = "esg-bullets";
const NUMBERED = "esg-numbered";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" } as const;
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function runs(r: RichRun[], size = 20): TextRun[] {
  return r.flatMap((x) =>
    x.text.split("\n").map(
      (part, i) => new TextRun({ text: part, bold: x.bold, italics: x.italic, strike: x.strike, break: i > 0 ? 1 : 0, size, font: FONT }),
    ),
  );
}

export function textParagraphs(text: string | null, opts: { bold?: boolean; size?: number; color?: string } = {}): Paragraph[] {
  if (!text) return [new Paragraph({ children: [new TextRun({ text: "—", color: "999999", size: opts.size ?? 20, font: FONT })] })];
  return [
    new Paragraph({
      children: text.split("\n").map(
        (line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0, bold: opts.bold, size: opts.size ?? 20, color: opts.color, font: FONT }),
      ),
    }),
  ];
}

export function richParagraphs(html: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const b of htmlToBlocks(html)) {
    if (b.type === "paragraph") out.push(new Paragraph({ children: runs(b.runs, b.heading ? 22 : 20), spacing: { after: 60 } }));
    else for (const item of b.items) out.push(new Paragraph({ children: runs(item), numbering: { reference: b.ordered ? NUMBERED : BULLETS, level: 0 } }));
  }
  return out.length ? out : textParagraphs(null);
}

function itemCell(item: EsgItem): Paragraph[] {
  const parts: Paragraph[] = [];
  if (item.html) parts.push(...richParagraphs(item.html));
  if (item.value !== null || !item.html) parts.push(...textParagraphs(item.value));
  return parts;
}

function cell(children: Paragraph[], opts: { shade?: boolean; width?: number } = {}) {
  return new TableCell({
    children,
    borders: CELL_BORDERS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" } : undefined,
  });
}

export function fieldsTable(items: EsgItem[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: items.map(
      (item) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(textParagraphs(`${item.label}${item.required ? " *" : ""}`, { bold: true, size: 18, color: "404040" }), { shade: true, width: 32 }),
            cell(itemCell(item), { width: 68 }),
          ],
        }),
    ),
  });
}

export function gridTable(t: { columns: string[]; rows: (string | null)[][]; numeric?: boolean[] }): Table {
  const align = (i: number) => (t.numeric?.[i] ? AlignmentType.RIGHT : AlignmentType.LEFT);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: t.columns.map((c, i) =>
          cell([new Paragraph({ alignment: align(i), children: [new TextRun({ text: c, bold: true, size: 18, font: FONT })] })], { shade: true }),
        ),
      }),
      ...t.rows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: row.map((v, i) =>
              cell([
                new Paragraph({
                  alignment: align(i),
                  children: (v ?? "").split("\n").map((line, j) => new TextRun({ text: line, break: j > 0 ? 1 : 0, size: 18, font: FONT })),
                }),
              ]),
            ),
          }),
      ),
    ],
  });
}

function blockElements(block: EsgBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "fields":
      return [fieldsTable(block.items), spacer()];
    case "table":
      return [
        ...(block.table.title ? [new Paragraph({ children: [new TextRun({ text: block.table.title, bold: true, size: 18, font: FONT, color: "404040" })], spacing: { before: 60, after: 40 } })] : []),
        gridTable(block.table as EsgTable),
        spacer(),
      ];
    case "note":
      return [new Paragraph({ children: [new TextRun({ text: block.text, italics: true, size: 18, color: "666666", font: FONT })] })];
    default: {
      const _exhaustive: never = block;
      throw new Error(`Unhandled block: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function spacer() {
  return new Paragraph({ children: [], spacing: { after: 80 } });
}

function sectionElements(s: EsgSection, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) {
  return [
    new Paragraph({ heading: level, children: [new TextRun({ text: `${s.letter}. ${s.title}${s.na ? " — not applicable" : ""}`, font: FONT })], keepNext: true }),
    ...s.blocks.flatMap(blockElements),
  ];
}

function orderElements(o: EsgSetupOrder, prefix: string) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      children: [new TextRun({ text: `${o.number ? `${prefix}${o.number} · ` : ""}${o.name}`, font: FONT })],
    }),
    ...o.sections.flatMap((s) => sectionElements(s, HeadingLevel.HEADING_3)),
  ];
}

function scheduleTable(rows: EsgScheduleRow[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const days = new Map<string, EsgScheduleRow[]>();
  for (const r of rows) days.set(r.dayDate, [...(days.get(r.dayDate) ?? []), r]);
  for (const [day, list] of Array.from(days.entries())) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: day, font: FONT })], keepNext: true }));
    out.push(
      gridTable({
        columns: ["Start", "End", "Function #", "Function name", "Facility", "Room", "Set-up", "Set for", "Posting", "24-hr hold"],
        numeric: [false, false, false, false, false, false, false, true, false, false],
        rows: list.map((r) => [r.start, r.end, r.number, r.name, r.facility, r.room, r.setup, r.setFor, r.posting, r.hold24 ? "Yes" : "No"]),
      }),
    );
    out.push(spacer());
  }
  return out.length ? out : [new Paragraph({ children: [new TextRun({ text: "No scheduled functions.", font: FONT })] })];
}

export function chrome(title: string, eventName: string, sub: string, attribution: string) {
  return {
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: `${eventName} — ${title}`, bold: true, size: 16, font: FONT }),
              new TextRun({ text: sub ? `   ${sub}` : "", size: 16, color: "666666", font: FONT }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({ children: [new TextRun({ text: attribution, size: 14, color: "666666", font: FONT })] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, font: FONT }),
            ],
          }),
        ],
      }),
    },
  };
}

export const numbering = {
  config: [
    {
      reference: BULLETS,
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
    },
    {
      reference: NUMBERED,
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
    },
  ],
};

export const styles = {
  default: { document: { run: { font: FONT, size: 20 } } },
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 30, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 120 } } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 24, bold: true, font: FONT, color: "1F3864" }, paragraph: { spacing: { before: 200, after: 80 } } },
    { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { size: 21, bold: true, font: FONT }, paragraph: { spacing: { before: 160, after: 60 } } },
  ],
};

export async function renderEsgDocx(doc: EsgDocument): Promise<Buffer> {
  const { meta } = doc;
  const sub = [meta.dateOriginated ? `Originated ${meta.dateOriginated}` : null, meta.dateRevised ? `Revised ${meta.dateRevised}` : null]
    .filter(Boolean)
    .join(" · ");
  const head = chrome("Event Specifications Guide", meta.eventName, sub, doc.attribution);
  const sections: ISectionOptions[] = [];

  const cover: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Event Specifications Guide", font: FONT, size: 40, bold: true })] }),
    fieldsTable([
      { label: "Event", value: `${meta.eventName}\n${meta.eventDates}` },
      { label: "Organizer / host", value: meta.organizer },
      { label: "Contact", value: [meta.contactName, meta.contactPhone].filter(Boolean).join(" · ") || null },
      { label: "Date originated", value: meta.dateOriginated },
      { label: "Date revised", value: meta.dateRevised },
      { label: "Generated", value: meta.generatedAt },
    ]),
  ];
  if (doc.narrative) {
    cover.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Part I — Narrative", font: FONT })] }));
    for (const s of doc.narrative.sections) cover.push(...sectionElements(s));
  }
  sections.push({ ...head, properties: {}, children: cover });

  if (doc.functionSchedule) {
    sections.push({
      ...head,
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Part II — Function Schedule", font: FONT })] }),
        ...scheduleTable(doc.functionSchedule),
      ],
    });
  }
  const orders: (Paragraph | Table)[] = [];
  if (doc.setupOrders) {
    orders.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Part IIIa — Function Set-up Orders", font: FONT })] }));
    for (const o of doc.setupOrders) orders.push(...orderElements(o, "#"));
  }
  if (doc.boothOrders) {
    orders.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: "Part IIIb — Booth Set-up Orders", font: FONT })] }));
    for (const o of doc.boothOrders) orders.push(...orderElements(o, "Booth "));
  }
  if (orders.length) sections.push({ ...head, properties: {}, children: orders });

  return Packer.toBuffer(new Document({ creator: "Event Manager", title: `${meta.eventName} — Event Specifications Guide`, numbering, styles, sections }));
}

export async function renderPerDocx(doc: PerDocument): Promise<Buffer> {
  const head = chrome("Post-Event Report", doc.meta.eventName, doc.meta.eventDates, `${doc.attribution} Reproduced ${doc.meta.generatedAt}.`);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Post-Event Report", font: FONT, size: 40, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `${doc.meta.eventName} · ${doc.meta.eventDates}`, font: FONT })], spacing: { after: 120 } }),
    ...doc.sections.flatMap((s) => sectionElements(s)),
  ];
  return Packer.toBuffer(
    new Document({ creator: "Event Manager", title: `${doc.meta.eventName} — Post-Event Report`, numbering, styles, sections: [{ ...head, properties: {}, children }] }),
  );
}
