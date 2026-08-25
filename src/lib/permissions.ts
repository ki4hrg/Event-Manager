import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { PermissionLevel, PermissionScope } from "@prisma/client";
import type { PermissionResource } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";
import type { PermissionMap } from "./eventPermissions";

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
      select: { eventId: true, accessLevel: true },
    }),
  ]);
  return {
    permissions,
    // eventId -> per-event cap (null when uncapped). Presence of the key is the
    // ASSIGNED/UNASSIGNED test; the value narrows the level. Carried on this
    // cached read rather than fetched per check — one page render issues
    // dozens of permission checks.
    assignedEvents: new Map(assignments.map((s) => [s.eventId, s.accessLevel])),
  };
});

// Back-compat alias used by existing callers. New code should call
// loadPermissionsForUser directly with an explicit userId.
export const loadPermissions = loadPermissionsForUser;

// Returns true if the user has GLOBAL view (or higher) on the given resource.
// Pre-loaded permissions are passed in so a caller that already invoked
// loadPermissions/loadPermissionsForUser doesn't pay for a second round-trip.
export function hasGlobalView(
  perms: Awaited<ReturnType<typeof loadPermissions>>["permissions"],
  resource: PermissionResource,
) {
  const match = perms.find((p) => p.resource === resource && p.scope === "GLOBAL");
  return !!match && match.level !== "NONE";
}

// Effective level for one (user, resource, event) triple, before any action is
// compared against it. Split out from resolvePermissionForUser so callers that
// need the level itself — the UI's read-only gating, which asks "what can this
// user do here?" rather than "may they do X?" — don't have to probe with one
// call per action.
async function resolveLevelForUser(
  userId: string,
  resource: PermissionResource,
  eventId?: string | null,
) {
  const { permissions, assignedEvents } = await loadPermissionsForUser(userId);

  let scope: PermissionScope;
  if (eventId == null) {
    scope = PermissionScope.GLOBAL;
  } else {
    scope = assignedEvents.has(eventId)
      ? PermissionScope.ASSIGNED
      : PermissionScope.UNASSIGNED;
  }

  const granted = permissions.find((p) => p.resource === resource && p.scope === scope);
  let level: PermissionLevel = granted?.level ?? PermissionLevel.NONE;

  // Per-event cap. Only narrows, so a cap can never grant access the role
  // doesn't already carry. Sitting here means it applies to every event-scoped
  // resource for this event — functions, every order type, files, share links,
  // workflows — and to MCP as well as the UI.
  if (eventId != null && scope === PermissionScope.ASSIGNED) {
    const cap = assignedEvents.get(eventId);
    if (cap != null && LEVEL_ORDER[cap] < LEVEL_ORDER[level]) level = cap;
  }

  return { scope, level } as const;
}

async function resolvePermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
) {
  const { scope, level } = await resolveLevelForUser(userId, resource, eventId);
  const allowed = LEVEL_ORDER[level] >= LEVEL_ORDER[action];
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

// Effective level for many resources at once, for the signed-in user. The
// event layout calls this once per request and hands the result to the UI so
// pages and panels can hide actions the server would refuse. Cheap: every
// lookup rides the same cache()d loadPermissionsForUser read.
export async function permissionLevels(
  resources: PermissionResource[],
  eventId?: string | null,
): Promise<PermissionMap> {
  const session = await auth();
  if (!session?.user?.id) return {};
  const entries = await Promise.all(
    resources.map(
      async (resource) =>
        [resource, (await resolveLevelForUser(session.user.id, resource, eventId)).level] as const,
    ),
  );
  return Object.fromEntries(entries);
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
