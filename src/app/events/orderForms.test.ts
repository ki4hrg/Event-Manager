import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { createCateringOrder, createTimelineItem, updateCateringOrderContract, updateCateringOrderGuestCounts } from "./catering-orders/actions";
import { createSetupEquipmentItem, createSetupTable } from "./setup-orders/actions";
import { createAVEquipmentItem, createAVOrder } from "./av-orders/actions";

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
    // Refusals come back as { error } (withUserErrors) so the form can show them (#252).
    await expect(createCateringOrder(eventId, form({ name: "Lunch", expectedCount: "lots" }))).resolves.toEqual({
      error: "Expected count must be a whole number",
    });
    await expect(createCateringOrder(eventId, form({ name: "Lunch", rentalMinimum: "NaN" }))).resolves.toHaveProperty("error");
    await expect(createCateringOrder(eventId, form({ name: "Lunch", vendorId: "x".repeat(101) }))).rejects.toThrow();
    expect(await prisma.cateringOrder.count({ where: { eventId } })).toBe(0);
  });

  it("returns a catering refusal as { error } and still throws for another event's order", async () => {
    const { eventId } = await event({ [PermissionResource.CATERING_ORDERS]: PermissionLevel.WRITE });
    const order = await prisma.cateringOrder.create({ data: { eventId, name: "Lunch", expectedCount: 40 } as never });
    await expect(updateCateringOrderGuestCounts(order.id, eventId, form({ expectedCount: "-3" }))).resolves.toHaveProperty("error");
    expect((await prisma.cateringOrder.findUniqueOrThrow({ where: { id: order.id } })).expectedCount).toBe(40);

    // A foreign order id is not a refusal to show: it reads as not found and throws.
    const other = await event({ [PermissionResource.CATERING_ORDERS]: PermissionLevel.WRITE });
    await expect(createTimelineItem(order.id, other.eventId, form({ label: "Doors", startTime: "2026-11-01T09:00" }))).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    expect(await prisma.timelineItem.count({ where: { cateringOrderId: order.id } })).toBe(0);
  });

  it("returns timeline time refusals as { error }", async () => {
    const { eventId } = await event({ [PermissionResource.CATERING_ORDERS]: PermissionLevel.WRITE });
    const order = await prisma.cateringOrder.create({ data: { eventId, name: "Lunch" } as never });
    const add = (fields: Record<string, string>) => createTimelineItem(order.id, eventId, form({ label: "Doors", ...fields }));
    await expect(add({})).resolves.toEqual({ error: "Start time is required" });
    await expect(add({ startTime: "soon" })).resolves.toEqual({ error: "Start time must be a date and time" });
    await expect(add({ startTime: "2026-11-01T10:00", endTime: "2026-11-01T09:00" })).resolves.toEqual({
      error: "End time can't be before the start time",
    });
    expect(await prisma.timelineItem.count({ where: { cateringOrderId: order.id } })).toBe(0);
  });

  it("refuses a contract deadline that isn't a date instead of clearing it", async () => {
    const { eventId } = await event({ [PermissionResource.CATERING_ORDERS]: PermissionLevel.WRITE });
    const deadline = new Date("2026-10-01");
    const order = await prisma.cateringOrder.create({ data: { eventId, name: "Lunch", depositDeadline: deadline } as never });
    await expect(updateCateringOrderContract(order.id, eventId, form({ depositDeadline: "2026-13-45" }))).resolves.toHaveProperty("error");
    expect((await prisma.cateringOrder.findUniqueOrThrow({ where: { id: order.id } })).depositDeadline).toEqual(deadline);
  });

  it("returns order and equipment refusals as { error }, writing nothing", async () => {
    const { eventId } = await event({
      [PermissionResource.AV_ORDERS]: PermissionLevel.WRITE,
      [PermissionResource.SETUP_ORDERS]: PermissionLevel.WRITE,
    });
    await expect(createAVOrder(eventId, form({ name: "" }))).resolves.toHaveProperty("error");
    expect(await prisma.aVOrder.count({ where: { eventId } })).toBe(0);

    const setup = await prisma.setupOrder.create({ data: { eventId, name: "Ballroom" } as never });
    await expect(createSetupEquipmentItem(setup.id, eventId, form({ item: "Riser", quantity: "lots" }))).resolves.toHaveProperty("error");
    await expect(createSetupEquipmentItem(setup.id, eventId, form({ item: "   ", quantity: "2" }))).resolves.toEqual({
      error: "Name the item or pick equipment",
    });
    expect(await prisma.equipmentItem.count({ where: { setupOrderId: setup.id } })).toBe(0);
  });

  it("still throws for equipment on another event's order", async () => {
    const { eventId } = await event({ [PermissionResource.AV_ORDERS]: PermissionLevel.WRITE });
    const av = await prisma.aVOrder.create({ data: { eventId, name: "Keynote" } as never });
    const other = await event({ [PermissionResource.AV_ORDERS]: PermissionLevel.WRITE });
    await expect(createAVEquipmentItem(av.id, other.eventId, form({ item: "Mic", quantity: "2" }))).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    expect(await prisma.equipmentItem.count({ where: { avOrderId: av.id } })).toBe(0);
  });

  it("refuses a setup table with no quantity instead of storing NaN", async () => {
    const { eventId } = await event({ [PermissionResource.SETUP_ORDERS]: PermissionLevel.WRITE });
    const order = await prisma.setupOrder.create({ data: { eventId, name: "Ballroom" } as never });
    await expect(createSetupTable(order.id, eventId, form({ tableType: "Round" }))).rejects.toThrow("Quantity is required");
    expect(await prisma.setupTable.count({ where: { setupOrderId: order.id } })).toBe(0);
  });
});
