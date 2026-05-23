import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { PermissionLevel, PermissionScope } from "@prisma/client";
import type { PermissionResource } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";

export type PermissionAction = Exclude<PermissionLevel, "NONE">;

export type PermissionErrorKind = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

// Thrown by requirePermissionForUser when access is denied. The session-bound
// requirePermission() wrapper catches this and translates to redirect()/notFound()
// for the UI; the MCP route handler catches it and maps to a protocol-level error.
// Never let this escape to a Next render — Next won't know how to handle it.
export class PermissionError extends Error {
  readonly kind: PermissionErrorKind;
  constructor(kind: PermissionErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "PermissionError";
    this.kind = kind;
  }
}

const LEVEL_ORDER: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  WRITE: 2,
  DELETE: 3,
};

export const loadPermissionsForUser = cache(async (userId: string) => {
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

// Back-compat alias used by existing callers. New code should call
// loadPermissionsForUser directly with an explicit userId.
export const loadPermissions = loadPermissionsForUser;

async function resolvePermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
) {
  const { permissions, assignedEventIds } = await loadPermissionsForUser(userId);

  let scope: PermissionScope;
  if (eventId == null) {
    scope = PermissionScope.GLOBAL;
  } else {
    scope = assignedEventIds.has(eventId)
      ? PermissionScope.ASSIGNED
      : PermissionScope.UNASSIGNED;
  }

  const granted = permissions.find((p) => p.resource === resource && p.scope === scope);
  const allowed = !!granted && LEVEL_ORDER[granted.level] >= LEVEL_ORDER[action];
  return { scope, allowed } as const;
}

export async function hasPermission(
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const { allowed } = await resolvePermissionForUser(
    session.user.id,
    resource,
    action,
    eventId,
  );
  return allowed;
}

export async function hasPermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
): Promise<boolean> {
  const { allowed } = await resolvePermissionForUser(userId, resource, action, eventId);
  return allowed;
}

// Principal-aware permission check. Throws PermissionError on denial; never
// redirects. Used by MCP tools (and any other non-Next caller) where the user
// identity comes from a bearer token rather than the request cookie.
export async function requirePermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
) {
  const { scope, allowed } = await resolvePermissionForUser(userId, resource, action, eventId);
  if (!allowed) {
    if (scope === PermissionScope.UNASSIGNED && action === "VIEW") {
      throw new PermissionError("NOT_FOUND");
    }
    throw new PermissionError("FORBIDDEN");
  }
}

// Session-aware wrapper preserving the existing UI behavior:
//   - no session → redirect("/login")
//   - UNASSIGNED + VIEW denial → notFound() (hide existence of the event)
//   - any other denial → redirect("/")
export async function requirePermission(
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    await requirePermissionForUser(session.user.id, resource, action, eventId);
  } catch (err) {
    if (err instanceof PermissionError) {
      if (err.kind === "NOT_FOUND") notFound();
      redirect("/");
    }
    throw err;
  }
  return session;
}
