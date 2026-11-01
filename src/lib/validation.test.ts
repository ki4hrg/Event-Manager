import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";
import { PermissionError } from "@/lib/permissions";
import { assertIds, formEnum, formId, formIds, formInt, formNumber, formValue, looseCount, looseNumber, looseText, parseArgs, readJsonList } from "./validation";

const Row = z.object({ name: z.string(), n: z.number().nullable() });

function form(value?: string) {
  const fd = new FormData();
  if (value !== undefined) fd.set("rows", value);
  return fd;
}

describe("readJsonList", () => {
  it("reads absent or empty as no rows", () => {
    expect(readJsonList(form(), "rows", Row)).toEqual([]);
    expect(readJsonList(form(""), "rows", Row)).toEqual([]);
  });

  it("returns the checked rows, dropping keys the schema doesn't name", () => {
    expect(readJsonList(form(JSON.stringify([{ name: "a", n: 1, extra: true }])), "rows", Row)).toEqual([{ name: "a", n: 1 }]);
  });

  it.each([
    ["malformed JSON", "[{"],
    ["a non-list", JSON.stringify({ name: "a" })],
    ["an entry of the wrong shape", JSON.stringify([{ name: 1, n: null }])],
    ["an entry missing a key", JSON.stringify([{ n: 1 }])],
    ["too many entries", JSON.stringify(Array(3).fill({ name: "a", n: null }))],
  ])("refuses %s with a readable error, not a 500", (_label, value) => {
    expect(() => readJsonList(form(value), "rows", Row, 2)).toThrow(UserFacingError);
  });
});

describe("parseArgs and the loose readers for action arguments", () => {
  it("reads NaN, Infinity and undefined the way the cores always have", () => {
    expect(looseNumber.parse(Number.NaN)).toBeNull();
    expect(looseNumber.parse(Number.POSITIVE_INFINITY)).toBeNull();
    expect(looseNumber.parse(undefined)).toBeNull();
    expect(looseNumber.parse(4.5)).toBe(4.5);
    expect(looseCount.parse(Number.NaN)).toBe(0);
    expect(looseText().parse(undefined)).toBeNull();
  });

  it("refuses what isn't a number or text", () => {
    expect(looseNumber.safeParse("4").success).toBe(false);
    expect(looseText().safeParse({ not: "" }).success).toBe(false);
  });

  it("returns the parsed value, or refuses with a readable error", () => {
    expect(parseArgs(Row, { name: "a", n: null, extra: 1 })).toEqual({ name: "a", n: null });
    expect(() => parseArgs(Row, { name: { not: "" }, n: null })).toThrow(UserFacingError);
  });
});

describe("assertIds", () => {
  it("passes ids and refuses filter objects, arrays and blanks as not found", () => {
    expect(() => assertIds("a1", "b2")).not.toThrow();
    for (const bad of [{ not: "" }, { in: ["a"] }, ["a"], "", null, undefined, 7]) {
      expect(() => assertIds("a1", bad)).toThrow(PermissionError);
    }
  });
});

describe("form readers", () => {
  const fd = (fields: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
    return f;
  };

  it("reads blanks as none and well-formed values as themselves", () => {
    const f = fd({ count: " 12 ", price: "4.5", vendorId: "v1", none: "", sentinel: "__blank__", status: "", ids: ["a", "", "b"], name: "  Lunch " });
    expect(formInt(f, "count")).toBe(12);
    expect(formInt(f, "none")).toBeNull();
    expect(formNumber(f, "price")).toBe(4.5);
    expect(formId(f, "vendorId")).toBe("v1");
    expect(formId(f, "sentinel")).toBeNull();
    expect(formEnum(f, "status", ["NEEDED", "PACKED"], "NEEDED")).toBe("NEEDED");
    expect(formIds(f, "ids")).toEqual(["a", "b"]);
    expect(formValue(f, "name")).toBe("Lunch");
    expect(formValue(f, "missing")).toBe("");
  });

  it("refuses what the old parseInt and parseFloat let through as NaN or a guess", () => {
    const f = fd({ count: "abc", frac: "2.5", price: "cheap", status: "LOST" });
    expect(() => formInt(f, "count")).toThrow("Count must be a whole number");
    expect(() => formInt(f, "frac")).toThrow(UserFacingError);
    expect(() => formInt(fd({ n: "-1" }), "n", { min: 0 })).toThrow("N must be between 0");
    expect(() => formNumber(f, "price")).toThrow("Price must be a number");
    expect(() => formEnum(f, "status", ["NEEDED", "PACKED"], "NEEDED")).toThrow("Pick a status from the list");
  });
});
