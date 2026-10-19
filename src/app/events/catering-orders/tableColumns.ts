import type { TableColumnDef } from "@/lib/tableColumns";

export const CATERING_ORDER_TABLE_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "status", label: "Status" },
  { key: "workflow", label: "Workflow" },
  { key: "vendors", label: "Vendor(s)" },
  { key: "serviceStyle", label: "Service Style" },
  { key: "guaranteeCount", label: "Guarantee" },
  { key: "function", label: "Function" },
] as const satisfies readonly TableColumnDef[];

export type CateringOrderTableColumn = (typeof CATERING_ORDER_TABLE_COLUMNS)[number]["key"];
