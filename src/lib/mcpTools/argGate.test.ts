import { describe, expect, it } from "vitest";
import { classifiedTools, findMcpTool } from "@/lib/mcpTools";
import { checkToolArgs } from "./argGate";
import type { McpToolDefinition } from "./types";

const tool = (inputSchema: McpToolDefinition["inputSchema"]): McpToolDefinition => ({
  name: "test_tool",
  description: "",
  inputSchema,
  handler: async () => null,
});

const order = tool({
  type: "object",
  properties: {
    eventId: { type: "string" },
    status: { type: "string", enum: ["DRAFT", "CONFIRMED"] },
    quantity: { type: "integer" },
    price: { type: ["number", "null"] },
    rush: { type: "boolean" },
    notes: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, qty: { type: "number" } },
        required: ["label"],
      },
    },
    values: { type: "object" },
  },
  required: ["eventId"],
  additionalProperties: false,
});

const check = (args: Record<string, unknown>) => checkToolArgs(order, args);

describe("checkToolArgs", () => {
  it("passes well-formed arguments through", () => {
    const args = { eventId: "e1", status: "DRAFT", quantity: 3, price: 9.5, rush: true, tags: ["a"], lines: [{ label: "x", qty: 2 }], values: { k: 1 } };
    expect(check(args)).toEqual({ ok: true, args });
  });

  it("keeps what the handlers read as 'clear': null anywhere, \"\" except for booleans", () => {
    expect(check({ eventId: "e1", notes: null, price: null, quantity: "", status: "", rush: null })).toMatchObject({ ok: true });
    expect(check({ eventId: "e1", rush: "" })).toMatchObject({ ok: false });
  });

  it("converts numeric strings for numbers", () => {
    expect(check({ eventId: "e1", quantity: "12", price: " 4.5 " })).toEqual({ ok: true, args: { eventId: "e1", quantity: 12, price: 4.5 } });
  });

  it("drops keys the schema doesn't name, at every level", () => {
    expect(check({ eventId: "e1", stray: 1, lines: [{ label: "x", extra: true }] })).toEqual({
      ok: true,
      args: { eventId: "e1", lines: [{ label: "x" }] },
    });
  });

  it.each([
    ["a missing required key", {}, "eventId: required"],
    ["a wrong type", { eventId: 7 }, "eventId: wrong type"],
    ["a value outside the enum", { eventId: "e1", status: "SHIPPED" }, "status"],
    ["a fractional integer", { eventId: "e1", quantity: 2.5 }, "quantity"],
    ["a non-numeric string for a number", { eventId: "e1", price: "cheap" }, "price"],
    ["a string for a boolean", { eventId: "e1", rush: "true" }, "rush"],
    ["a nested missing key", { eventId: "e1", lines: [{ qty: 1 }] }, "lines.0.label: required"],
    ["an over-long list", { eventId: "e1", tags: Array(1001).fill("a") }, "tags"],
    ["an over-long string", { eventId: "x".repeat(100_001) }, "eventId"],
  ])("refuses %s, naming the argument", (_label, args, fragment) => {
    const result = check(args);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid arguments for test_tool");
      expect(result.message).toContain(fragment);
    }
  });

  it("builds a gate for every registered tool", () => {
    for (const { name } of classifiedTools() as { name: string }[]) {
      expect(() => checkToolArgs(findMcpTool(name)!, {})).not.toThrow();
    }
  });
});
