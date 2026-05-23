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

export type { McpToolDefinition, McpToolHandler, McpToolContext } from "./types";
