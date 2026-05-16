import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { PermissionLevel, PermissionScope } from "@prisma/client";
import type { PermissionResource } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";

export type PermissionAction = Exclude<PermissionLevel, "NONE">;

const LEVEL_ORDER: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  WRITE: 2,
  DELETE: 3,
};

export const loadPermissions = cache(async (userId: string) => {
  const [permissions, assignments] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { role: { users: { some: { id: userId } } } },
    }),
    prisma.eventStaff.findMany({
      where: { userId },
      select: { eventId: true },
    }),
  ]);
  return {
    permissions,
    assignedEventIds: new Set(assignments.map((s) => s.eventId)),
  };
});

export async function requirePermission(
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { permissions, assignedEventIds } = await loadPermissions(session.user.id);

  let scope: PermissionScope;
  if (eventId == null) {
    scope = PermissionScope.GLOBAL;
  } else {
    scope = assignedEventIds.has(eventId)
      ? PermissionScope.ASSIGNED
      : PermissionScope.UNASSIGNED;
  }

  const granted = permissions.find((p) => p.resource === resource && p.scope === scope);
  if (!granted || LEVEL_ORDER[granted.level] < LEVEL_ORDER[action]) {
    // Hide existence of unassigned events on read; redirect home on write/delete or admin-resource denial.
    if (scope === PermissionScope.UNASSIGNED && action === "VIEW") notFound();
    redirect("/");
  }
  return session;
}
