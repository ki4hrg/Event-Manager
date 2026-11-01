import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { roleWithinCeiling } from "@/lib/permissions";
import { makeMember, makeRole, makeTenant } from "../../../../test/fixtures";
import { createUser, removeUserFromTenant, resendPasswordResetEmail, updateUser } from "./actions";
import { setEventStaffLevelCore } from "@/app/events/[id]/staff/core";
import { PermissionScope } from "@prisma/client";

// revalidatePath needs Next's request store; the invite email isn't under test.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));

const { USERS, EVENTS } = PermissionResource;
const { VIEW, WRITE, DELETE } = PermissionLevel;
const REDIRECTED = { digest: expect.stringContaining("NEXT_REDIRECT") };
// Refusals come back as { error } (withUserErrors), so the person reads them (#252).
const REFUSED = { error: expect.stringContaining("access") };

// A user manager: USERS WRITE/DELETE and EVENTS VIEW, nothing else.
async function userManager() {
  const tenant = await makeTenant();
  const manager = await makeMember(tenant.id, { [USERS]: DELETE, [EVENTS]: VIEW });
  vi.mocked(auth).mockResolvedValue({ user: { id: manager.id }, expires: "" } as never);
  const admin = await makeRole({ [USERS]: DELETE, [EVENTS]: DELETE });
  const viewer = await makeRole({ [EVENTS]: VIEW });
  return { tenantId: tenant.id, managerId: manager.id, admin, viewer };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("role ceiling (#284): USERS WRITE can't hand out more than the caller holds", () => {
  it("refuses inviting someone with a role above the caller's own access", async () => {
    const { tenantId, admin } = await userManager();
    const email = `new-${admin.id}@example.test`;
    await expect(createUser(form({ email, roleId: admin.id }))).resolves.toEqual(REFUSED);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.tenantMembership.count({ where: { tenantId, roleId: admin.id } })).toBe(0);
  });

  it("allows a role within the caller's access", async () => {
    const { tenantId, viewer } = await userManager();
    await expect(createUser(form({ email: `ok-${viewer.id}@example.test`, roleId: viewer.id }))).rejects.toMatchObject(REDIRECTED);
    expect(await prisma.tenantMembership.count({ where: { tenantId, roleId: viewer.id } })).toBe(1);
  });

  it("refuses removing a member whose role is above the caller's", async () => {
    const { tenantId, admin } = await userManager();
    const target = await prisma.user.create({ data: { email: `adm-${admin.id}@example.test` } });
    await prisma.tenantMembership.create({ data: { tenantId, userId: target.id, roleId: admin.id } });
    await expect(removeUserFromTenant(target.id)).resolves.toEqual(REFUSED);
    expect(await prisma.tenantMembership.count({ where: { tenantId, userId: target.id } })).toBe(1);
  });

  it("compares level by level, per resource and scope", async () => {
    const { tenantId, managerId } = await userManager();
    const grant = (resource: PermissionResource, level: PermissionLevel) => ({ resource, scope: "GLOBAL" as const, level });
    expect(await roleWithinCeiling(managerId, tenantId, [grant(USERS, WRITE)])).toBe(true);
    expect(await roleWithinCeiling(managerId, tenantId, [grant(EVENTS, WRITE)])).toBe(false);
  });

  it("refuses editing an Admin's email, or sending them a reset link: that would take over the account", async () => {
    const { tenantId, admin } = await userManager();
    const target = await prisma.user.create({ data: { email: `boss-${admin.id}@example.test` } });
    await prisma.tenantMembership.create({ data: { tenantId, userId: target.id, roleId: admin.id } });
    await expect(updateUser(target.id, form({ email: "attacker@example.test", roleId: admin.id }))).resolves.toEqual(REFUSED);
    await expect(resendPasswordResetEmail(target.id)).resolves.toEqual(REFUSED);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).email).toBe(`boss-${admin.id}@example.test`);
  });

  it("refuses moving a member from a lower role to one above the caller's", async () => {
    const { tenantId, admin, viewer } = await userManager();
    const target = await prisma.user.create({ data: { email: `v-${viewer.id}@example.test` } });
    await prisma.tenantMembership.create({ data: { tenantId, userId: target.id, roleId: viewer.id } });
    await expect(updateUser(target.id, form({ email: target.email!, roleId: admin.id }))).resolves.toEqual(REFUSED);
    expect((await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId, userId: target.id } })).roleId).toBe(viewer.id);
  });
});

describe("event staff caps: nobody lifts their own", () => {
  it("refuses a capped staff member clearing their own cap", async () => {
    const tenant = await makeTenant();
    const user = await makeMember(tenant.id, { [EVENTS]: DELETE }, PermissionScope.ASSIGNED);
    const event = await prisma.event.create({ data: { tenantId: tenant.id, name: "E", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-02") } });
    const staff = await prisma.eventStaff.create({ data: { eventId: event.id, userId: user.id, accessLevel: "WRITE" } });
    await expect(setEventStaffLevelCore({ staffId: staff.id, eventId: event.id, accessLevel: null }, user.id)).rejects.toBeInstanceOf(UserFacingError);
    expect((await prisma.eventStaff.findUniqueOrThrow({ where: { id: staff.id } })).accessLevel).toBe("WRITE");
  });
});
