import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { getHotelPickupHistory, getHotels, getPickupPattern } from "./actions";

beforeEach(async () => {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, { [PermissionResource.HOTELS]: PermissionLevel.VIEW });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
});

describe("hotel readers: URL filters of the wrong shape mean no filter", () => {
  it("ignores a filter object, a bad date and non-text amenities instead of throwing", async () => {
    await expect(getHotelPickupHistory({ seriesId: { not: "" }, from: "yesterday" } as never)).resolves.toBeDefined();
    await expect(getHotels([{ has: "x" }] as never)).resolves.toEqual([]);
    await expect(getPickupPattern({ seriesId: { not: "" }, contractTypes: "x", guestTypes: [1] } as never)).resolves.toBeDefined();
  });
});
