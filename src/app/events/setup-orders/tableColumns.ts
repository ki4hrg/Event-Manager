import type { TableColumnDef } from "@/lib/tableColumns";

export const SETUP_ORDER_TABLE_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "status", label: "Status" },
  { key: "workflow", label: "Workflow" },
  { key: "vendors", label: "Vendor(s)" },
  { key: "type", label: "Type" },
  { key: "room", label: "Room" },
  { key: "tables", label: "Tables" },
  { key: "equipment", label: "Equipment" },
  { key: "functions", label: "Functions" },
] as const satisfies readonly TableColumnDef[];

export type SetupOrderTableColumn = (typeof SETUP_ORDER_TABLE_COLUMNS)[number]["key"];
