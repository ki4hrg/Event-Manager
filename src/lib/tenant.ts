import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { getUserSetting, setUserSetting, SETTING_KEYS } from "./userSettings";

// Which tenant a request is acting in.
//
// Users are global; every domain row belongs to a Tenant. A signed-in user has
// one *active* tenant (a UserSetting, switched from the header) and may enter
// any tenant they hold a TenantMembership in — or every tenant, for a platform
// super admin. Event-scoped work doesn't consult the active tenant at all: the
// event's own tenantId decides which membership applies (see
// src/lib/permissions.ts), so a link into another tenant's event just works and
// the event layout re-points the active tenant to match.

export type TenantSummary = { id: string; name: string; slug: string };

export type TenantContext = {
  userId: string;
  isSuperAdmin: boolean;
  // Every tenant the user may enter, sorted by name.
  tenants: TenantSummary[];
  active: TenantSummary | null;
};

const tenantSelect = { id: true, name: true, slug: true } as const;

// Tenants a user may enter. Super admins see all of them.
export const accessibleTenantsForUser = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      memberships: {
        select: { tenant: { select: tenantSelect } },
        orderBy: { tenant: { name: "asc" } },
      },
    },
  });
  if (!user) return { isSuperAdmin: false, tenants: [] as TenantSummary[] };
  const tenants = user.isSuperAdmin
    ? await prisma.tenant.findMany({ select: tenantSelect, orderBy: { name: "asc" } })
    : user.memberships.map((m) => m.tenant);
  return { isSuperAdmin: user.isSuperAdmin, tenants };
});

// Cached per request: the header, the permission layer, and most pages all ask.
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const [{ isSuperAdmin, tenants }, stored] = await Promise.all([
    accessibleTenantsForUser(userId),
    getUserSetting(userId, SETTING_KEYS.ACTIVE_TENANT_ID),
  ]);
  // A stale preference (membership revoked, tenant deleted) silently falls back
  // to the first tenant rather than locking the user out.
  const active = tenants.find((t) => t.id === stored) ?? tenants[0] ?? null;
  return { userId, isSuperAdmin, tenants, active };
});

export async function getActiveTenantId(): Promise<string | null> {
  const ctx = await getTenantContext();
  return ctx?.active?.id ?? null;
}

// Redirects when there is no signed-in user, or the user belongs to no tenant
// (an invited account whose memberships were all revoked). Every tenant-scoped
// page and Server Action goes through here via requirePermission.
export async function requireActiveTenantId(): Promise<string> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect("/no-tenant");
  return ctx.active.id;
}

export async function requireActiveTenant(): Promise<TenantSummary> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect("/no-tenant");
  return ctx.active;
}

export async function isSuperAdmin(): Promise<boolean> {
  const ctx = await getTenantContext();
  return ctx?.isSuperAdmin ?? false;
}

// Platform-admin gate for tenant management. Not a PermissionResource: roles
// are per-tenant, and creating tenants is precisely the thing that has to work
// before any membership exists.
export async function requireSuperAdmin() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  if (!ctx.isSuperAdmin) redirect("/");
  return ctx;
}

export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const { isSuperAdmin } = await accessibleTenantsForUser(userId);
  return isSuperAdmin;
}

// Persists the active tenant if the user may enter it. Returns false otherwise
// so callers can decide between an error and a silent no-op.
export async function setActiveTenantForUser(userId: string, tenantId: string): Promise<boolean> {
  const { tenants } = await accessibleTenantsForUser(userId);
  if (!tenants.some((t) => t.id === tenantId)) return false;
  await setUserSetting(userId, SETTING_KEYS.ACTIVE_TENANT_ID, tenantId);
  return true;
}

// The tenant an event belongs to. Cached because one page render issues dozens
// of event-scoped permission checks that all resolve the same event.
export const getEventTenantId = cache(async (eventId: string): Promise<string | null> => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { tenantId: true },
  });
  return event?.tenantId ?? null;
});

// Resolves the MCP `tenant` argument (slug or id) against what the user may
// enter. Returns null when the handle is unknown or off-limits — the caller
// treats both the same so an outsider can't probe which slugs exist.
export async function resolveTenantForUser(
  userId: string,
  slugOrId: string,
): Promise<TenantSummary | null> {
  const { tenants } = await accessibleTenantsForUser(userId);
  return tenants.find((t) => t.slug === slugOrId || t.id === slugOrId) ?? null;
}

export function slugifyTenantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
