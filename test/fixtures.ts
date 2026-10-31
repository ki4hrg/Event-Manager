import { randomUUID } from "node:crypto";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Builders for the rows most tests need. Every name is unique, so test files
// can share one database without cleaning up.

const unique = () => randomUUID().slice(0, 8);

export async function makeTenant(name = "Org") {
  const id = unique();
  return prisma.tenant.create({ data: { name: `${name} ${id}`, slug: `t-${id}` } });
}

export async function makeUser() {
  return prisma.user.create({ data: { email: `u-${unique()}@example.test` } });
}

/**
 * A role granting `level` on each resource in `scope`. GLOBAL covers tenant-wide
 * checks; an event-scoped check (an event id as the target) reads UNASSIGNED,
 * or ASSIGNED for events the user is staffed on.
 */
export async function makeRole(
  grants: Partial<Record<PermissionResource, PermissionLevel>>,
  scope: PermissionScope = PermissionScope.GLOBAL,
) {
  return prisma.role.create({
    data: {
      name: `role-${unique()}`,
      permissions: {
        create: Object.entries(grants).map(([resource, level]) => ({
          resource: resource as PermissionResource,
          scope,
          level,
        })),
      },
    },
  });
}

/** A user who is a member of `tenantId` with a role granting `grants` in `scope`. */
export async function makeMember(
  tenantId: string,
  grants: Partial<Record<PermissionResource, PermissionLevel>>,
  scope: PermissionScope = PermissionScope.GLOBAL,
) {
  const [user, role] = await Promise.all([makeUser(), makeRole(grants, scope)]);
  await prisma.tenantMembership.create({ data: { tenantId, userId: user.id, roleId: role.id } });
  return user;
}
