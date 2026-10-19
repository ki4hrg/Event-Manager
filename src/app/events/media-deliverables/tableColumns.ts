import type { TableColumnDef } from "@/lib/tableColumns";

export const MEDIA_DELIVERABLE_TABLE_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "status", label: "Status" },
  { key: "workflow", label: "Workflow" },
  { key: "mediaType", label: "Media Type" },
  { key: "provider", label: "Provider" },
  { key: "functions", label: "Functions" },
  { key: "presentations", label: "Presentations" },
] as const satisfies readonly TableColumnDef[];

export type MediaDeliverableTableColumn = (typeof MEDIA_DELIVERABLE_TABLE_COLUMNS)[number]["key"];
