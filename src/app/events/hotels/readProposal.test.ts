import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/userErrors";
import { PermissionError } from "@/lib/permissionError";
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
    ["a night with fractional rooms", { nights: JSON.stringify([{ ...night, rooms: 2.5 }]) }],
    ["a charge with an unknown scope", { charges: JSON.stringify([{ chargeType: "Fee", amount: 1, scope: "PER_GUEST" }]) }],
    ["an amenity with an unknown status", { amenities: JSON.stringify([{ label: "Pool", status: "MAYBE", note: null }]) }],
    ["a meal price that isn't a number", { meals: JSON.stringify([{ mealType: "Lunch", price: "42" }]) }],
    ["malformed spaces JSON", { spaces: "[{" }],
    ["an unknown F&B minimum scope", { fbMinimumScope: "WHENEVER" }],
    ["a revision that isn't a whole number", { revision: "two" }],
    ["an attrition that isn't a number", { allowedAttrition: "ten percent" }],
  ])("refuses %s", (_label, fields) => {
    expect(() => readProposal(form(fields))).toThrow(UserFacingError);
  });

  it("reads a lead source that isn't an id as not found", () => {
    expect(() => readProposal(form({ leadSource: "x".repeat(101) }))).toThrow(PermissionError);
  });
});

describe("updateHotelBlock: the autosaving card gets refusals back as { error }", () => {
  it("returns the field's message instead of throwing it away", async () => {
    const { vi } = await import("vitest");
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { PermissionLevel, PermissionResource, PermissionScope } = await import("@prisma/client");
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { makeMember, makeTenant } = await import("../../../../test/fixtures");
    const { updateHotelBlock } = await import("./actions");
    const tenant = await makeTenant();
    const user = await makeMember(tenant.id, { [PermissionResource.HOTELS]: PermissionLevel.WRITE }, PermissionScope.UNASSIGNED);
    const ev = await prisma.event.create({ data: { tenantId: tenant.id, name: "E", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") } });
    const venue = await prisma.venue.create({ data: { tenantId: tenant.id, name: "H" } });
    const proposal = await prisma.hotelProposal.create({ data: { eventId: ev.id, venueId: venue.id, status: "Pending" } });
    const block = await prisma.hotelBlock.create({ data: { proposalId: proposal.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
    const fd = new FormData();
    fd.set("driveMinutes", "12.5");
    await expect(updateHotelBlock(block.id, ev.id, fd)).resolves.toEqual({ error: "Drive minutes must be a whole number" });
  });
});
