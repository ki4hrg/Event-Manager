import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { createCateringOrder } from "./catering-orders/actions";
import { createSetupTable } from "./setup-orders/actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function event(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, grants, PermissionScope.UNASSIGNED);
  const ev = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { eventId: ev.id };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("order forms: numbers, ids and enums are checked, not parsed into NaN", () => {
  it("refuses a catering count that isn't a number, creating nothing", async () => {
    const { eventId } = await event({ [PermissionResource.CATERING_ORDERS]: PermissionLevel.WRITE });
    await expect(createCateringOrder(eventId, form({ name: "Lunch", expectedCount: "lots" }))).rejects.toThrow(
      "Expected count must be a whole number",
    );
    await expect(createCateringOrder(eventId, form({ name: "Lunch", rentalMinimum: "NaN" }))).rejects.toBeInstanceOf(UserFacingError);
    await expect(createCateringOrder(eventId, form({ name: "Lunch", vendorId: "x".repeat(101) }))).rejects.toThrow();
    expect(await prisma.cateringOrder.count({ where: { eventId } })).toBe(0);
  });

  it("refuses a setup table with no quantity instead of storing NaN", async () => {
    const { eventId } = await event({ [PermissionResource.SETUP_ORDERS]: PermissionLevel.WRITE });
    const order = await prisma.setupOrder.create({ data: { eventId, name: "Ballroom" } as never });
    await expect(createSetupTable(order.id, eventId, form({ tableType: "Round" }))).rejects.toThrow("Quantity is required");
    expect(await prisma.setupTable.count({ where: { setupOrderId: order.id } })).toBe(0);
  });
});
