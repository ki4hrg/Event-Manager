import type { TableColumnDef } from "@/lib/tableColumns";

export const PRINT_ORDER_TABLE_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "status", label: "Status" },
  { key: "workflow", label: "Workflow" },
  { key: "vendors", label: "Vendor(s)" },
  { key: "items", label: "Items" },
  { key: "functions", label: "Functions" },
  { key: "presentation", label: "Presentation" },
] as const satisfies readonly TableColumnDef[];

export type PrintOrderTableColumn = (typeof PRINT_ORDER_TABLE_COLUMNS)[number]["key"];
