import { z } from "zod";
import type { McpToolDefinition } from "./types";

// Runs a tool's advertised inputSchema against its arguments before the
// handler sees them. The schemas use a small JSON Schema subset (type, enum,
// items, properties, required, additionalProperties); this builds a zod schema
// from it with the leniency the handlers already rely on:
//
// - `null` is allowed anywhere: the partial helpers read it as "clear".
// - `""` is allowed for strings and numbers, read as "clear" the same way.
// - A numeric string ("12", "4.5") is accepted for a number and converted.
// - Keys the schema doesn't name are dropped, not refused: handlers never read
//   them, and refusing would break callers that send a stray field.
// - Every string, list and object has a size bound.
//
// What it refuses: a missing required key, a value of the wrong type, a value
// outside an enum, an over-long string or list. The handler still checks the
// meaning of each value (ids, permissions, dates).

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
};

const MAX_STRING = 100_000;
const MAX_ITEMS = 1_000;
const MAX_KEYS = 200;

const NUMERIC = /^\s*-?\d+(\.\d+)?\s*$/;
const toNumber = (v: unknown) => (typeof v === "string" && NUMERIC.test(v) ? Number(v) : v);

function forType(type: string, schema: JsonSchema): z.ZodType {
  switch (type) {
    case "string": {
      const s = z.string().max(MAX_STRING);
      const values = schema.enum?.filter((v): v is string => typeof v === "string");
      if (!values?.length) return s;
      return s.refine((v) => v === "" || values.includes(v), { message: `must be one of: ${values.join(", ")}` });
    }
    case "number":
      return z.preprocess(toNumber, z.number().finite());
    case "integer":
      return z.preprocess(toNumber, z.number().int());
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schema.items ? forSchema(schema.items) : z.unknown()).max(MAX_ITEMS);
    case "object":
      return schema.properties ? objectFor(schema) : z.record(z.string(), z.unknown()).refine((o) => Object.keys(o).length <= MAX_KEYS, { message: "too many keys" });
    case "null":
      return z.null();
    default:
      return z.unknown();
  }
}

function forSchema(schema: JsonSchema): z.ZodType {
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const typed = types.filter((t) => t !== "null").map((t) => forType(t, schema));
  // `null` means "clear" to the handlers whatever the declared type, and so
  // does `""` except for booleans (partialBoolean refuses it).
  const onlyBoolean = types.every((t) => t === "boolean" || t === "null");
  const clear = onlyBoolean ? z.null() : z.union([z.null(), z.literal("")]);
  if (typed.length === 0) return types.includes("null") ? clear : z.unknown();
  return z.union([clear, ...typed]);
}

function objectFor(schema: JsonSchema) {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const value = forSchema(prop);
    shape[key] = required.has(key) ? value : value.optional();
  }
  // z.object drops unknown keys.
  return z.object(shape);
}

const gates = new WeakMap<McpToolDefinition, z.ZodType>();

function gateFor(tool: McpToolDefinition): z.ZodType {
  let gate = gates.get(tool);
  if (!gate) {
    gate = objectFor(tool.inputSchema as JsonSchema);
    gates.set(tool, gate);
  }
  return gate;
}

export type ArgCheck = { ok: true; args: Record<string, unknown> } | { ok: false; message: string };

/** Check `args` (tenant already removed) against the tool's inputSchema. */
export function checkToolArgs(tool: McpToolDefinition, args: Record<string, unknown>): ArgCheck {
  const result = gateFor(tool).safeParse(args);
  if (result.success) return { ok: true, args: result.data as Record<string, unknown> };
  const problems = result.error.issues.slice(0, 5).map((issue) => {
    const { path, message } = explain(issue, []);
    const where = path.length ? path.join(".") : "arguments";
    return `${where}: ${valueAt(args, path) === undefined ? "required" : message}`;
  });
  return { ok: false, message: `Invalid arguments for ${tool.name}: ${problems.join("; ")}` };
}

function valueAt(root: unknown, path: PropertyKey[]): unknown {
  let v = root;
  for (const key of path) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<PropertyKey, unknown>)[key];
  }
  return v;
}

// Every value sits in a "clear or typed" union, so a problem deep inside a
// list or object arrives as a union failure at its top. Follow the branch that
// got furthest so the message names the argument that's actually wrong.
function explain(issue: z.core.$ZodIssue, base: PropertyKey[]): { path: PropertyKey[]; message: string } {
  const path = [...base, ...issue.path];
  if (issue.code !== "invalid_union") return { path, message: issue.message };
  let best: { path: PropertyKey[]; message: string } | null = null;
  for (const branch of issue.errors) {
    for (const inner of branch) {
      const found = explain(inner, path);
      if (!best || found.path.length > best.path.length) best = found;
    }
  }
  return best && best.path.length > path.length ? best : { path, message: "wrong type" };
}
