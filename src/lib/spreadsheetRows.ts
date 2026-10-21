import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { SheetRow } from "@/lib/pickupMapping";

// Reading a CSV or XLSX attachment on the server, for inbox parsing. Hotels'
// reports often put a title block above the header row, so a sheet is read as
// a plain grid first and split into header + rows once the header row is known.

export type SheetKind = "csv" | "xlsx";

export function sheetKind(fileName: string, mimeType: string): SheetKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".csv") || mimeType === "text/csv") return "csv";
  if (name.endsWith(".xlsx") || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  return null;
}

// Excel stores dates as naive day counts, which exceljs hands back as UTC
// midnight; YYYY-MM-DD keeps them on the right day.
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  }
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value);
}

// Every non-empty row of the first sheet, as text cells.
export async function readGrid(content: Buffer, kind: SheetKind): Promise<string[][]> {
  let grid: string[][];
  if (kind === "csv") {
    const parsed = Papa.parse<string[]>(content.toString("utf8").replace(/^﻿/, ""), { skipEmptyLines: true });
    grid = parsed.data.map((r) => r.map((c) => (c ?? "").trim()));
  } else {
    const wb = new ExcelJS.Workbook();
    // exceljs's Buffer type predates Node's generic Buffer.
    await wb.xlsx.load(content as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    grid = [];
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell.value).trim();
      });
      grid.push(Array.from(cells, (c) => c ?? ""));
    });
  }
  return grid.filter((r) => r.some(Boolean));
}

// headerIndex: 0-based index into the grid. Blank or repeated headers get a
// unique name so every column can be mapped.
export function gridToRows(grid: string[][], headerIndex: number): { headers: string[]; rows: SheetRow[] } {
  const raw = grid[headerIndex] ?? [];
  const width = Math.max(raw.length, ...grid.slice(headerIndex + 1).map((r) => r.length));
  const seen = new Set<string>();
  const headers = Array.from({ length: width }, (_, i) => {
    let h = (raw[i] ?? "").trim() || `Column ${i + 1}`;
    if (seen.has(h)) h = `${h} (${i + 1})`;
    seen.add(h);
    return h;
  });
  const rows = grid
    .slice(headerIndex + 1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])))
    .filter((r) => Object.values(r).some(Boolean));
  return { headers, rows };
}
