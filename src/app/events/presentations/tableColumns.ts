import type { TableColumnDef } from "@/lib/tableColumns";

export const PRESENTATION_TABLE_COLUMNS = [
  { key: "title", label: "Title", required: true },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
  { key: "track", label: "Track" },
  { key: "speaker", label: "Primary Speaker" },
  { key: "slots", label: "Schedule" },
] as const satisfies readonly TableColumnDef[];

export type PresentationTableColumn = (typeof PRESENTATION_TABLE_COLUMNS)[number]["key"];
