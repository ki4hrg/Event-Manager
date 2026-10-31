// Shared shape for every MCP tool. The dispatcher in /mcp/route.ts loads
// the registry (see ./index.ts), advertises tools on tools/list, and runs the
// matching handler on tools/call. The dispatcher guarantees `args` is a JSON
// object; the handler is responsible for shape-checking what it needs.
//
// The advertised JSON Schema isn't enforced per argument yet (phase 3,
// docs/plans/phase3-boundaries.md); until it is, Prisma and permission checks
// throw on bad input and the dispatcher returns the error to the caller.
export type McpToolHandler = (args: Record<string, unknown>, ctx: McpToolContext) => Promise<unknown>;

export type McpToolContext = {
  userId: string;
  // The tenant this call runs in, resolved by the dispatcher from the `tenant`
  // argument (or the user's only tenant). Global checks and creates use it;
  // event-scoped tools still derive the tenant from the event itself.
  tenantId: string;
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

// Partial-update readers: undefined when the key is absent (leave the column
// alone), null when explicitly null or "" (clear it).
export function partialString(args: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw new Error(`${key} must be a string`);
  return v;
}

export function partialInt(args: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${key} must be an integer`);
  return v;
}

export function partialBoolean(args: Record<string, unknown>, key: string): boolean | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  if (typeof v !== "boolean") throw new Error(`${key} must be a boolean`);
  return v;
}
