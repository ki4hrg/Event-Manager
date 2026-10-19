import type { TableColumnDef } from "@/lib/tableColumns";

// Shared by the table view and its print route so both honor the same picks.
export const FUNCTION_TABLE_COLUMNS = [
  { key: "number", label: "#" },
  { key: "name", label: "Name", required: true },
  { key: "status", label: "Status" },
  { key: "earliestStart", label: "Earliest Start" },
  { key: "latestEnd", label: "Latest End" },
  { key: "notes", label: "Setup Notes" },
  { key: "type", label: "Type" },
  { key: "rooms", label: "Room(s)" },
  { key: "contacts", label: "Contact(s)" },
  { key: "av", label: "AV Order" },
  { key: "setup", label: "Setup Order" },
  { key: "catering", label: "Catering Order" },
  { key: "workflow", label: "Workflow" },
] as const satisfies readonly TableColumnDef[];

export type FunctionTableColumn = (typeof FUNCTION_TABLE_COLUMNS)[number]["key"];
