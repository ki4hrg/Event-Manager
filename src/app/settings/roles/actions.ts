"use server";

import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSION_GROUPS, permissionFieldName } from "./resources";

export async function getRoles() {
  await requirePermission(PermissionResource.ROLES, "VIEW");
  return prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

export async function getRole(id: string) {
  await requirePermission(PermissionResource.ROLES, "VIEW");
  return prisma.role.findUnique({
    where: { id },
    include: { permissions: true },
  });
}

// Returns the minimal shape needed by `<select>` pickers (UserForm, etc.).
export async function getRoleOptions() {
  await requirePermission(PermissionResource.USERS, "VIEW");
  return prisma.role.findMany({
    select: { id: true, name: true, isSystem: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

type PermissionRow = {
  resource: PermissionResource;
  scope: PermissionScope;
  level: PermissionLevel;
};

const VALID_LEVELS = new Set<string>(Object.values(PermissionLevel));

function parsePermissions(formData: FormData): PermissionRow[] {
  const rows: PermissionRow[] = [];
  for (const group of PERMISSION_GROUPS) {
    for (const { value: resource } of group.resources) {
      for (const scope of group.scopes) {
        rows.push({ resource, scope, level: readLevel(formData, resource, scope) });
      }
    }
  }
  return rows;
}

function readLevel(
  formData: FormData,
  resource: PermissionResource,
  scope: PermissionScope,
): PermissionLevel {
  const raw = formData.get(permissionFieldName(resource, scope));
  if (typeof raw === "string" && VALID_LEVELS.has(raw)) return raw as PermissionLevel;
  return PermissionLevel.NONE;
}

export async function createRole(formData: FormData) {
  await requirePermission(PermissionResource.ROLES, "WRITE");

  const name = ((formData.get("name") as string) || "").trim();
  const description = (formData.get("description") as string)?.trim() || null;
  if (!name) throw new Error("Name is required");

  const duplicate = await prisma.role.findUnique({ where: { name }, select: { id: true } });
  if (duplicate) throw new Error("A role with this name already exists");

  const rows = parsePermissions(formData);
  const role = await prisma.role.create({
    data: {
      name,
      description,
      isSystem: false,
      permissions: { create: rows },
    },
    select: { id: true },
  });

  revalidatePath("/settings/roles");
  revalidatePath(`/settings/roles/${role.id}`);
  redirect(`/settings/roles/${role.id}?success=Role+created`);
}

export async function updateRole(id: string, formData: FormData) {
  await requirePermission(PermissionResource.ROLES, "WRITE");

  const role = await prisma.role.findUnique({
    where: { id },
    select: { isSystem: true, name: true },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("System roles cannot be modified");

  const name = ((formData.get("name") as string) || "").trim();
  const description = (formData.get("description") as string)?.trim() || null;
  if (!name) throw new Error("Name is required");

  if (name !== role.name) {
    const duplicate = await prisma.role.findUnique({ where: { name }, select: { id: true } });
    if (duplicate) throw new Error("A role with this name already exists");
  }

  const rows = parsePermissions(formData);

  await prisma.$transaction([
    prisma.role.update({ where: { id }, data: { name, description } }),
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({ data: rows.map((r) => ({ roleId: id, ...r })) }),
  ]);

  revalidatePath("/settings/roles");
  revalidatePath(`/settings/roles/${id}`);
  redirect(`/settings/roles/${id}?success=Role+updated`);
}

export async function deleteRole(id: string) {
  await requirePermission(PermissionResource.ROLES, "DELETE");

  const role = await prisma.role.findUnique({
    where: { id },
    select: { isSystem: true, _count: { select: { users: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("System roles cannot be deleted");
  if (role._count.users > 0) {
    throw new Error(
      `Cannot delete: ${role._count.users} user(s) are assigned this role. Reassign them first.`,
    );
  }

  await prisma.role.delete({ where: { id } });

  revalidatePath("/settings/roles");
  redirect("/settings/roles?success=Role+deleted");
}
