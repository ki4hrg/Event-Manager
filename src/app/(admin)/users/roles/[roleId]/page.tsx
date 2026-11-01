import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { deleteRole, getRole, updateRole } from "../actions";
import { RoleForm } from "../RoleForm";
import { LastUpdated } from "@/components/LastUpdated";
import { isSuperAdmin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roleId: string }>;
}): Promise<Metadata> {
  const { roleId } = await params;
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
  return { title: role?.name ?? "Role" };
}

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const [role, superAdmin] = await Promise.all([getRole(roleId), isSuperAdmin()]);
  if (!role) notFound();

  const saveAction = async (formData: FormData) => {
    "use server";
    return updateRole(roleId, formData);
  };

  const deleteAction = role.isSystem || !superAdmin
    ? undefined
    : async () => {
        "use server";
        return deleteRole(roleId);
      };

  return (
    <div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Roles", href: "/users/roles" }, { label: role.name }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{role.name}</h1>
        <div className="mt-1">
          <LastUpdated updatedAt={role.updatedAt} updatedBy={role.updatedBy} />
        </div>
      </div>
      <RoleForm role={role} saveAction={saveAction} deleteAction={deleteAction} canEdit={superAdmin} />
    </div>
  );
}
