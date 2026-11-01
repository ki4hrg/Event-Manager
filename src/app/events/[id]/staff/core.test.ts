import { describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../../../test/fixtures";
import { removeEventStaffCore } from "./core";
import { removeEventStaff } from "./actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// An admin-like role: DELETE on events in both scopes, capped at WRITE on one event.
async function cappedStaff() {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, { [PermissionResource.EVENTS]: PermissionLevel.DELETE }, PermissionScope.ASSIGNED);
  await prisma.rolePermission.create({
    data: {
      roleId: (await prisma.tenantMembership.findFirstOrThrow({ where: { userId: user.id } })).roleId,
      resource: PermissionResource.EVENTS,
      scope: PermissionScope.UNASSIGNED,
      level: PermissionLevel.DELETE,
    },
  });
  const event = await prisma.event.create({ data: { tenantId: tenant.id, name: "E", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-02") } });
  const staff = await prisma.eventStaff.create({ data: { eventId: event.id, userId: user.id, accessLevel: "WRITE" } });
  return { userId: user.id, eventId: event.id, staffId: staff.id };
}

describe("event staff caps: removing your own capped row is lifting the cap", () => {
  it("refuses a capped staff member removing themselves, and keeps the row", async () => {
    const { userId, eventId, staffId } = await cappedStaff();
    await expect(removeEventStaffCore(staffId, eventId, userId)).rejects.toBeInstanceOf(UserFacingError);
    expect(await prisma.eventStaff.count({ where: { id: staffId } })).toBe(1);
  });

  it("returns that refusal to the staff list's Remove button as { error }", async () => {
    const { userId, eventId, staffId } = await cappedStaff();
    vi.mocked(auth).mockResolvedValue({ user: { id: userId }, expires: "" } as never);
    await expect(removeEventStaff(staffId, eventId)).resolves.toEqual({
      error: "You can't change your own access to an event; ask an admin",
    });
    expect(await prisma.eventStaff.count({ where: { id: staffId } })).toBe(1);
  });
});
