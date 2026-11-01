import { describe, expect, it } from "vitest";
import { z } from "zod";
import { INBOUND_RESPONSE_SCHEMAS, ParseError, checkModelOutput } from "./inboundParse";

describe("inbound parse: the model's output is checked against its schema", () => {
  it("builds a checker from every response schema", () => {
    for (const [name, schema] of Object.entries(INBOUND_RESPONSE_SCHEMAS)) {
      expect(() => z.fromJSONSchema(schema as never), name).not.toThrow();
    }
  });

  it("refuses output of the wrong shape and accepts the right one", () => {
    const classify = z.fromJSONSchema(INBOUND_RESPONSE_SCHEMAS.classify as never);
    expect(classify.safeParse({ kind: { not: "" } }).success).toBe(false);
    expect(classify.safeParse("everything").success).toBe(false);
    expect(classify.safeParse({}).success).toBe(false);
  });

  it("accepts a minimal valid response for every schema, nested lists included", () => {
    type Schema = { type?: string | string[]; enum?: unknown[]; properties?: Record<string, Schema>; items?: Schema };
    // One valid instance: "", 0, false, the first enum value, one item per list.
    const sample = (sch: Schema): unknown => {
      if (sch.enum) return sch.enum[0];
      const type = Array.isArray(sch.type) ? sch.type[0] : sch.type;
      if (type === "object") return Object.fromEntries(Object.entries(sch.properties ?? {}).map(([k, v]) => [k, sample(v)]));
      if (type === "array") return sch.items ? [sample(sch.items)] : [];
      if (type === "integer" || type === "number") return 0;
      if (type === "boolean") return false;
      if (type === "null") return null;
      return "";
    };
    for (const [name, schema] of Object.entries(INBOUND_RESPONSE_SCHEMAS)) {
      const result = z.fromJSONSchema(schema as never).safeParse(sample(schema as Schema));
      expect(result.success, `${name}: ${result.success ? "" : JSON.stringify(result.error.issues[0])}`).toBe(true);
    }
  });

  it("refuses a malformed reply as a ParseError naming the call and field, and returns a good one", () => {
    const schema = INBOUND_RESPONSE_SCHEMAS.classify;
    expect(() => checkModelOutput(schema, { kind: "OTHER", summary: 1, notes: "", eventSpace: false })).toThrow(ParseError);
    expect(() => checkModelOutput(schema, { kind: "OTHER", summary: 1, notes: "", eventSpace: false })).toThrow(/classify reply .*at summary/);
    expect(checkModelOutput(schema, { kind: "OTHER", summary: "s", notes: "", eventSpace: false })).toMatchObject({ kind: "OTHER" });
  });
});
