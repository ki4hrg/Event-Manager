import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/userErrors";
import { readProposal } from "./readProposal";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("venueId", "v1");
  fd.set("status", "Pending");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const night = { roomType: "King", night: "2026-11-01", rate: 189, rooms: 20 };

describe("readProposal: the lists a proposal form posts", () => {
  it("reads well-formed lists", () => {
    const args = readProposal(
      form({
        nights: JSON.stringify([night]),
        charges: JSON.stringify([{ chargeType: "Resort fee", amount: 25, scope: "PER_NIGHT" }]),
        amenities: JSON.stringify([{ label: "Pool", status: "CONFIRMED", note: null }]),
        meals: JSON.stringify([{ mealType: "Lunch", price: 42 }]),
        fbMinimumScope: "PER_STAY",
      }),
    );
    expect(args.nights).toEqual([night]);
    expect(args.charges[0].scope).toBe("PER_NIGHT");
    expect(args.meals).toEqual([{ mealType: "Lunch", price: 42 }]);
    expect(args.fbMinimumScope).toBe("PER_STAY");
  });

  it.each([
    ["a night with a non-date", { nights: JSON.stringify([{ ...night, night: "soon" }]) }],
    ["a night with negative rooms", { nights: JSON.stringify([{ ...night, rooms: -5 }]) }],
    ["a charge with an unknown scope", { charges: JSON.stringify([{ chargeType: "Fee", amount: 1, scope: "PER_GUEST" }]) }],
    ["an amenity with an unknown status", { amenities: JSON.stringify([{ label: "Pool", status: "MAYBE", note: null }]) }],
    ["a meal price that isn't a number", { meals: JSON.stringify([{ mealType: "Lunch", price: "42" }]) }],
    ["malformed spaces JSON", { spaces: "[{" }],
    ["an unknown F&B minimum scope", { fbMinimumScope: "WHENEVER" }],
  ])("refuses %s", (_label, fields) => {
    expect(() => readProposal(form(fields))).toThrow(UserFacingError);
  });
});
