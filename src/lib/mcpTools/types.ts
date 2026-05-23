// Shared shape for every MCP tool. The dispatcher in /api/mcp/route.ts loads
// the registry (see ./index.ts), advertises tools on tools/list, and runs the
// matching handler on tools/call. Tool args are passed as parsed JSON; the
// handler is responsible for shape-checking what it needs.
//
// We do not run runtime JSON Schema validation on incoming args — same trust
// model as Server Actions trusting FormData typing. The advertised schema is
// descriptive (helps the LLM construct correct calls); Prisma + permission
// checks throw on bad input and the dispatcher returns the error to the caller.
export type McpToolHandler = (args: Record<string, unknown>, ctx: McpToolContext) => Promise<unknown>;

export type McpToolContext = {
  userId: string;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: McpToolHandler;
};

// Tiny helpers for arg extraction. Throw descriptive Errors that the dispatcher
// surfaces as MCP tool errors.
export function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing required string arg: ${key}`);
  }
  return v;
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// Returns [] when missing or wrong shape; filters non-string entries out.
// Use for advisory list inputs (tags, role labels) where empty is a fine default.
export function optionalStringArray(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}
