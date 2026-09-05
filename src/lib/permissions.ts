import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import type { Session } from "next-auth";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { getEventTenantId, requireActiveTenantId, getActiveTenantId } from "./tenant";
import type { PermissionMap } from "./eventPermissions";

export type PermissionAction = Exclude<PermissionLevel, "NONE">;

export type PermissionErrorKind = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

// What a permission check is about. A string is an event id: the event's own
// tenant decides which membership applies, so callers never have to know the
// tenant of an event they hold an id for. A `{ tenantId }` is a global check
// (venues, contacts, catalogs) inside that tenant. The session-bound wrappers
// fill in the active tenant for global checks; principal-aware callers (MCP,
// the *Core functions) must say which tenant they mean.
export type PermissionTarget = string | { tenantId: string };

export type PermissionGrant = {
  resource: PermissionResource;
  scope: PermissionScope;
  level: PermissionLevel;
};

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

// Super admins hold every permission in every tenant. Synthesized rather than
// stored so a new PermissionResource never has to be granted to them by hand.
const SUPER_ADMIN_GRANTS: PermissionGrant[] = Object.values(PermissionResource).flatMap(
  (resource) =>
    Object.values(PermissionScope).map((scope) => ({
      resource,
      scope,
      level: PermissionLevel.DELETE,
    })),
);

// A user's effective grants inside one tenant: their membership role's rows,
// plus the events in that tenant they are staff on. No membership means no
// grants at all — which is how one tenant's data stays invisible to another's
// users even when both hold the same global role definition.
export const loadPermissionsForUser = cache(async (userId: string, tenantId: string) => {
  const [user, membership, assignments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: { select: { permissions: true } } },
    }),
    prisma.eventStaff.findMany({
      where: { userId, event: { tenantId } },
      select: { eventId: true, accessLevel: true },
    }),
  ]);
  const permissions: PermissionGrant[] = user?.isSuperAdmin
    ? SUPER_ADMIN_GRANTS
    : (membership?.role.permissions ?? []);
  return {
    permissions,
    isSuperAdmin: user?.isSuperAdmin ?? false,
    // eventId -> per-event cap (null when uncapped). Presence of the key is the
    // ASSIGNED/UNASSIGNED test; the value narrows the level. Carried on this
    // cached read rather than fetched per check — one page render issues
    // dozens of permission checks.
    assignedEvents: new Map(assignments.map((s) => [s.eventId, s.accessLevel])),
  };
});

// Returns true if the user has GLOBAL view (or higher) on the given resource.
// Pre-loaded permissions are passed in so a caller that already invoked
// loadPermissionsForUser doesn't pay for a second round-trip.
export function hasGlobalView(perms: PermissionGrant[], resource: PermissionResource) {
  const match = perms.find((p) => p.resource === resource && p.scope === "GLOBAL");
  return !!match && match.level !== "NONE";
}

// Effective level for one (user, resource, target) triple, before any action is
// compared against it. Split out from resolvePermissionForUser so callers that
// need the level itself — the UI's read-only gating, which asks "what can this
// user do here?" rather than "may they do X?" — don't have to probe with one
// call per action.
async function resolveLevelForUser(
  userId: string,
  resource: PermissionResource,
  target: PermissionTarget,
) {
  let eventId: string | null = null;
  let tenantId: string;
  if (typeof target === "string") {
    eventId = target;
    const eventTenantId = await getEventTenantId(eventId);
    // Unknown event: indistinguishable from an event the user can't see.
    if (!eventTenantId) {
      return { scope: PermissionScope.UNASSIGNED, level: PermissionLevel.NONE, tenantId: null } as const;
    }
    tenantId = eventTenantId;
  } else {
    tenantId = target.tenantId;
  }

  const { permissions, assignedEvents } = await loadPermissionsForUser(userId, tenantId);

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

  return { scope, level, tenantId } as const;
}

async function resolvePermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  target: PermissionTarget,
) {
  const { scope, level, tenantId } = await resolveLevelForUser(userId, resource, target);
  const allowed = LEVEL_ORDER[level] >= LEVEL_ORDER[action];
  return { scope, allowed, tenantId } as const;
}

// Session-bound target: an event id as given, otherwise the active tenant.
async function sessionTarget(eventId: string | null | undefined): Promise<PermissionTarget | null> {
  if (eventId) return eventId;
  const tenantId = await getActiveTenantId();
  return tenantId ? { tenantId } : null;
}

export async function hasPermission(
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const target = await sessionTarget(eventId);
  if (!target) return false;
  const { allowed } = await resolvePermissionForUser(session.user.id, resource, action, target);
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
  const target = await sessionTarget(eventId);
  if (!target) return {};
  const entries = await Promise.all(
    resources.map(
      async (resource) =>
        [resource, (await resolveLevelForUser(session.user.id, resource, target)).level] as const,
    ),
  );
  return Object.fromEntries(entries);
}

export async function hasPermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  target: PermissionTarget,
): Promise<boolean> {
  const { allowed } = await resolvePermissionForUser(userId, resource, action, target);
  return allowed;
}

// Principal-aware permission check. Throws PermissionError on denial; never
// redirects. Used by MCP tools (and any other non-Next caller) where the user
// identity comes from a bearer token rather than the request cookie.
export async function requirePermissionForUser(
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  target: PermissionTarget,
) {
  const { scope, allowed } = await resolvePermissionForUser(userId, resource, action, target);
  if (!allowed) {
    if (scope === PermissionScope.UNASSIGNED && action === "VIEW") {
      throw new PermissionError("NOT_FOUND");
    }
    throw new PermissionError("FORBIDDEN");
  }
}

export type PermittedSession = Session & { tenantId: string };

// Session-aware wrapper preserving the existing UI behavior:
//   - no session → redirect("/login")
//   - no tenant to act in → redirect("/no-tenant")
//   - UNASSIGNED + VIEW denial → notFound() (hide existence of the event)
//   - any other denial → redirect("/")
// Returns the session plus the tenant the check resolved against — the
// event's tenant for event-scoped checks, the active tenant otherwise — so a
// Server Action can hand it straight to the *Core it calls.
export async function requirePermission(
  resource: PermissionResource,
  action: PermissionAction,
  eventId?: string | null,
): Promise<PermittedSession> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const target: PermissionTarget = eventId ? eventId : { tenantId: await requireActiveTenantId() };
  try {
    const { scope, allowed, tenantId } = await resolvePermissionForUser(
      session.user.id,
      resource,
      action,
      target,
    );
    if (!allowed || !tenantId) {
      if (scope === PermissionScope.UNASSIGNED && action === "VIEW") {
        throw new PermissionError("NOT_FOUND");
      }
      throw new PermissionError("FORBIDDEN");
    }
    return { ...session, tenantId };
  } catch (err) {
    if (err instanceof PermissionError) {
      if (err.kind === "NOT_FOUND") notFound();
      redirect("/");
    }
    throw err;
  }
}

// The tenant an event belongs to, as a PermissionTarget for global checks that
// hang off an event (assigning one of the tenant's vendors to it, creating a
// contact from an event page). Unknown event → NOT_FOUND, same as a VIEW denial.
export async function requireEventTenantId(eventId: string): Promise<string> {
  const tenantId = await getEventTenantId(eventId);
  if (!tenantId) throw new PermissionError("NOT_FOUND");
  return tenantId;
}
