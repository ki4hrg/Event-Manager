import type { McpToolDefinition } from "./types";
import { eventTools } from "./events";
import { functionTools } from "./functions";
import { presentationTools } from "./presentations";
import { vendorTools } from "./vendors";
import { contactTools } from "./contacts";
import { venueTools } from "./venues";
import { orderTools } from "./orders";
import { reportTools } from "./reports";
import { storageLocationTools } from "./storageLocations";
import { inventoryTools } from "./inventory";
import { tenantTools } from "./tenants";
import { specificationTools } from "./specifications";
import { boothTools } from "./booths";
import { hotelTools } from "./hotels";
import { rfpTools } from "./rfps";
import { quoteTools } from "./quotes";

export const mcpTools: McpToolDefinition[] = [
  ...tenantTools,
  ...eventTools,
  ...specificationTools,
  ...functionTools,
  ...boothTools,
  ...hotelTools,
  ...rfpTools,
  ...quoteTools,
  ...presentationTools,
  ...vendorTools,
  ...contactTools,
  ...venueTools,
  ...orderTools,
  ...reportTools,
  ...storageLocationTools,
  ...inventoryTools,
];

const toolsByName: Map<string, McpToolDefinition> = new Map(
  mcpTools.map((t) => [t.name, t]),
);

export function findMcpTool(name: string): McpToolDefinition | undefined {
  return toolsByName.get(name);
}

// Tools that run without a tenant. Everything else is dispatched inside one.
export const TENANT_FREE_TOOLS = new Set<string>(tenantTools.map((t) => t.name));

// Advertised on every tenant-bound tool. Read and stripped by the dispatcher
// before the handler sees the arguments, so individual tool definitions stay
// tenant-agnostic.
export const TENANT_ARG = "tenant";
const tenantArgSchema = {
  type: "string",
  description:
    "Organization to act in — a tenant slug or id from `list_tenants`. Required when the user belongs to more than one organization; otherwise optional.",
} as const;

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
    const inputSchema = TENANT_FREE_TOOLS.has(t.name)
      ? t.inputSchema
      : {
          ...t.inputSchema,
          properties: { ...(t.inputSchema.properties ?? {}), [TENANT_ARG]: tenantArgSchema },
        };
    return {
      name: t.name,
      description: t.description,
      inputSchema,
      annotations,
      groups: [group],
    };
  });
}

export type { McpToolDefinition, McpToolHandler, McpToolContext } from "./types";
