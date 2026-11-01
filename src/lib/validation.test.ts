import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";
import { looseCount, looseNumber, looseText, parseArgs, readJsonList } from "./validation";

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
