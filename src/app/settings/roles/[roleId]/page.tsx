import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { deleteRole, getRole, updateRole } from "../actions";
import { RoleForm } from "../RoleForm";
import { LastUpdated } from "@/components/LastUpdated";

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
  const role = await getRole(roleId);
  if (!role) notFound();

  const saveAction = async (formData: FormData) => {
    "use server";
    await updateRole(roleId, formData);
  };

  const deleteAction = role.isSystem
    ? undefined
    : async () => {
        "use server";
        await deleteRole(roleId);
      };

  return (
    <div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Roles", href: "/settings/roles" }, { label: role.name }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">{role.name}</h2>
        <div className="mt-1">
          <LastUpdated updatedAt={role.updatedAt} updatedBy={role.updatedBy} />
        </div>
      </div>
      <RoleForm role={role} saveAction={saveAction} deleteAction={deleteAction} />
    </div>
  );
}
