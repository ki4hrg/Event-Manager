import type { McpToolDefinition } from "./types";
import { eventTools } from "./events";
import { functionTools } from "./functions";
import { presentationTools } from "./presentations";
import { vendorTools } from "./vendors";
import { contactTools } from "./contacts";
import { venueTools } from "./venues";
import { orderTools } from "./orders";
import { reportTools } from "./reports";

export const mcpTools: McpToolDefinition[] = [
  ...eventTools,
  ...functionTools,
  ...presentationTools,
  ...vendorTools,
  ...contactTools,
  ...venueTools,
  ...orderTools,
  ...reportTools,
];

const toolsByName: Map<string, McpToolDefinition> = new Map(
  mcpTools.map((t) => [t.name, t]),
);

export function findMcpTool(name: string): McpToolDefinition | undefined {
  return toolsByName.get(name);
}

// ---------------------------------------------------------------------------
// Tool classification — applied at serialize time so individual tool defs
// stay free of UI/grouping concerns. The classification keys off the name
// prefix; reports use `list_*` style names too (read-only) so they fall in
// naturally.
//
// What gets surfaced in tools/list:
//   - annotations.readOnlyHint     — true for list_/get_/search_
//   - annotations.destructiveHint  — true only for delete_ (cascades real rows)
//   - annotations.idempotentHint   — true for everything except create_
//   - annotations.openWorldHint    — false (we only touch this Prisma DB)
//   - groups                       — single category string ("read" | "create" |
//     "mutate" | "delete"). Per SEP-1300; Claude Desktop is expected to
//     render these as sub-sections eventually but doesn't today.

export type ToolGroup = "read" | "create" | "mutate" | "delete";

export type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ClassifiedTool = {
  name: string;
  description: string;
  inputSchema: McpToolDefinition["inputSchema"];
  annotations: ToolAnnotations;
  groups: [ToolGroup];
};

function classify(name: string): { annotations: ToolAnnotations; group: ToolGroup } {
  const isRead =
    name.startsWith("list_") || name.startsWith("get_") || name.startsWith("search_");
  const isCreate = name.startsWith("create_");
  // Only top-level entity deletes count as destructive. Junction removals
  // (remove_*, unlink_*) sever a relationship but the underlying entities
  // remain, so they're non-destructive in the MCP sense.
  const isDelete = name.startsWith("delete_");

  let group: ToolGroup;
  if (isRead) group = "read";
  else if (isCreate) group = "create";
  else if (isDelete) group = "delete";
  else group = "mutate";

  return {
    group,
    annotations: {
      readOnlyHint: isRead,
      destructiveHint: isDelete,
      idempotentHint: !isCreate,
      openWorldHint: false,
    },
  };
}

export function classifiedTools(): ClassifiedTool[] {
  return mcpTools.map((t) => {
    const { annotations, group } = classify(t.name);
    return {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations,
      groups: [group],
    };
  });
}

export type { McpToolDefinition, McpToolHandler, McpToolContext } from "./types";
