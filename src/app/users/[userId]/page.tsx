import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getUser, updateUser, deleteUser, removeUserFromTenant, resendPasswordResetEmail } from "../actions";
import { getTenantContext } from "@/lib/tenant";
import { getTenants, addMembership, setMembershipRole, removeMembership } from "@/app/tenants/actions";
import { MembershipEditor } from "@/app/tenants/MembershipEditor";
import { getRoleOptions } from "@/app/users/roles/actions";
import { UserForm } from "../UserForm";
import { ResendInviteButton } from "../ResendInviteButton";
import { notFound } from "next/navigation";
import { LastUpdated } from "@/components/LastUpdated";
import { formatEventDate } from "@/lib/agendaUtils";
import { EventAccessPanel } from "@/app/users/event-access/EventAccessPanel";
import {
  getUserEventAccess,
  getSeriesGrantOptions,
  searchEventsForUserAccess,
  grantUserEventAccess,
  setUserEventAccessLevel,
  revokeUserEventAccess,
  grantUserSeriesAccess,
} from "@/app/users/event-access/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  return { title: user?.name || user?.email || "User" };
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  const { userId } = await params;
  const { error } = await searchParams;
  const [user, roles, assignments, seriesOptions, ctx] = await Promise.all([
    getUser(userId),
    getRoleOptions(),
    getUserEventAccess(userId),
    getSeriesGrantOptions(),
    getTenantContext(),
  ]);

  if (!user || !ctx?.active) {
    notFound();
  }

  const isSuperAdmin = ctx.isSuperAdmin;
  const allTenants = isSuperAdmin ? await getTenants() : [];
  const memberTenantIds = new Set(user.memberships.map((m) => m.tenant.id));

  const updateAction = async (formData: FormData) => {
    "use server";
    await updateUser(userId, formData);
  };

  const deleteAction = async () => {
    "use server";
    await deleteUser(userId);
  };

  const removeAction = async () => {
    "use server";
    await removeUserFromTenant(userId);
  };

  const addMembershipAction = async (tenantId: string, roleId: string) => {
    "use server";
    await addMembership(tenantId, userId, roleId);
  };
  const setMembershipRoleAction = async (tenantId: string, roleId: string) => {
    "use server";
    await setMembershipRole(tenantId, userId, roleId);
  };
  const removeMembershipAction = async (tenantId: string) => {
    "use server";
    await removeMembership(tenantId, userId);
  };

  const resendAction = async () => {
    "use server";
    await resendPasswordResetEmail(userId);
  };

  const grantEventAction = async (eventId: string, accessLevel: string) => {
    "use server";
    await grantUserEventAccess(userId, eventId, accessLevel);
  };

  const setLevelAction = async (
    staffId: string,
    eventId: string,
    accessLevel: string,
  ) => {
    "use server";
    await setUserEventAccessLevel(userId, staffId, eventId, accessLevel);
  };

  const revokeAction = async (staffId: string, eventId: string) => {
    "use server";
    await revokeUserEventAccess(userId, staffId, eventId);
  };

  const grantSeriesAction = async (seriesId: string, accessLevel: string) => {
    "use server";
    return grantUserSeriesAccess(userId, seriesId, accessLevel);
  };

  const searchEventsAction = async (query: string) => {
    "use server";
    const rows = await searchEventsForUserAccess(userId, query);
    return rows.map((e) => ({
      id: e.id,
      name: e.name,
      year: formatEventDate(e.startDate, e.timezone, { year: "numeric" }),
      seriesName: e.series?.name ?? null,
    }));
  };

  return (
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: user.name || user.email }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">
          {user.name || user.email}
        </h2>
        <div className="mt-1">
          <LastUpdated updatedAt={user.updatedAt} updatedBy={user.updatedBy} />
        </div>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-800 dark:text-amber-300 text-sm">
          {error}
        </div>
      )}
      <UserForm
        user={user}
        roles={roles}
        saveAction={updateAction}
        deleteAction={isSuperAdmin ? deleteAction : undefined}
        removeAction={removeAction}
        currentUserId={session.user.id}
        tenantName={ctx.active.name}
        canManageSuperAdmin={isSuperAdmin}
      />
      {isSuperAdmin && (
        <div className="mt-6">
          <MembershipEditor
            title="Organizations"
            description="Every organization this account can enter, with the role held in each. Only super admins see this panel."
            rows={user.memberships.map((m) => ({
              id: m.tenant.id,
              label: m.tenant.name,
              sublabel: m.tenant.slug,
              href: `/tenants/${m.tenant.id}`,
              roleId: m.role.id,
              roleName: m.role.name,
            }))}
            candidates={allTenants
              .filter((t) => !memberTenantIds.has(t.id))
              .map((t) => ({ id: t.id, label: t.name }))}
            candidateLabel="Organization"
            roles={roles}
            add={addMembershipAction}
            setRole={setMembershipRoleAction}
            remove={removeMembershipAction}
          />
        </div>
      )}
      <div className="mt-6 bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Password
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Email the user a one-time link to choose or change their password. Sending invalidates any prior unused link.
        </p>
        <ResendInviteButton action={resendAction} />
      </div>
      <EventAccessPanel
        assignments={assignments.map((a) => ({
          id: a.id,
          accessLevel: a.accessLevel,
          event: {
            id: a.event.id,
            name: a.event.name,
            year: formatEventDate(a.event.startDate, a.event.timezone, {
              year: "numeric",
            }),
            seriesName: a.event.series?.name ?? null,
          },
        }))}
        seriesOptions={seriesOptions.map((s) => ({
          id: s.id,
          name: s.name,
          eventCount: s._count.events,
        }))}
        grantEvent={grantEventAction}
        setLevel={setLevelAction}
        revoke={revokeAction}
        grantSeries={grantSeriesAction}
        searchEvents={searchEventsAction}
      />
    </div>
  );
}
