import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getRoleOptions } from "@/app/users/roles/actions";
import {
  getTenant,
  getUserOptions,
  updateTenant,
  deleteTenant,
  addMembership,
  setMembershipRole,
  removeMembership,
} from "../actions";
import { TenantForm } from "../TenantForm";
import { MembershipEditor } from "../MembershipEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}): Promise<Metadata> {
  const { tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return { title: tenant?.name ?? "Organization" };
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const [tenant, users, roles] = await Promise.all([
    getTenant(tenantId),
    getUserOptions(),
    getRoleOptions(),
  ]);
  if (!tenant) notFound();

  const memberIds = new Set(tenant.memberships.map((m) => m.user.id));
  const candidates = users
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ id: u.id, label: u.name ? `${u.name} (${u.email})` : u.email }));

  const saveAction = async (formData: FormData) => {
    "use server";
    await updateTenant(tenantId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteTenant(tenantId);
  };
  const addAction = async (userId: string, roleId: string) => {
    "use server";
    await addMembership(tenantId, userId, roleId);
  };
  const setRoleAction = async (userId: string, roleId: string) => {
    "use server";
    await setMembershipRole(tenantId, userId, roleId);
  };
  const removeAction = async (userId: string) => {
    "use server";
    await removeMembership(tenantId, userId);
  };

  return (
    <div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Organizations", href: "/tenants" }, { label: tenant.name }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">{tenant.name}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {tenant._count.events} events · {tenant._count.venues} venues · {tenant._count.contacts}{" "}
          contacts · {tenant._count.vendors} vendors
        </p>
      </div>
      {/* Keyed on updatedAt so a save remounts the form back into view mode. */}
      <TenantForm
        key={tenant.updatedAt.toISOString()}
        tenant={tenant}
        saveAction={saveAction}
        deleteAction={deleteAction}
      />
      <div className="mt-6">
        <MembershipEditor
          title="Members"
          description=""
          rows={tenant.memberships.map((m) => ({
            id: m.user.id,
            label: m.user.name || m.user.email,
            sublabel: m.user.name ? m.user.email : m.user.isSuperAdmin ? "Super admin" : null,
            href: `/users/${m.user.id}`,
            roleId: m.role.id,
            roleName: m.role.name,
          }))}
          candidates={candidates}
          candidateLabel="User"
          roles={roles}
          add={addAction}
          setRole={setRoleAction}
          remove={removeAction}
        />
      </div>
    </div>
  );
}
