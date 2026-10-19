import type { TableColumnDef } from "@/lib/tableColumns";

export const SCHEDULE_ITEM_TABLE_COLUMNS = [
  { key: "dateTime", label: "Date / Time" },
  { key: "type", label: "Type" },
  { key: "function", label: "Function", required: true },
  { key: "isPublic", label: "Public" },
  { key: "notes", label: "Notes" },
] as const satisfies readonly TableColumnDef[];

export type ScheduleItemTableColumn = (typeof SCHEDULE_ITEM_TABLE_COLUMNS)[number]["key"];
