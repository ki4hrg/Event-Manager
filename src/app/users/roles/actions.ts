"use server";

import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { requireSuperAdmin } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSION_GROUPS, permissionFieldName } from "./resources";

export async function getRoles() {
  await requirePermission(PermissionResource.ROLES, "VIEW");
  return prisma.role.findMany({
    include: {
      _count: { select: { memberships: true } },
      // For flagging resources the role has never set (unsetResources).
      permissions: { select: { resource: true, scope: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

export async function getRole(id: string) {
  await requirePermission(PermissionResource.ROLES, "VIEW");
  return prisma.role.findUnique({
    where: { id },
    include: {
      permissions: true,
      updatedBy: { select: { name: true, email: true } },
    },
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

// Role definitions are global — one Admin/User/Viewer matrix shared by every
// tenant. Editing one changes what the role means in every organization, so
// every mutation is super-admin only; ROLES VIEW/WRITE on a tenant role only
// lets a tenant admin read the matrix and assign roles.
export async function createRole(formData: FormData) {
  const session = await requireSuperAdmin();

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
      updatedById: session.userId,
      permissions: { create: rows },
    },
    select: { id: true },
  });

  revalidatePath("/users/roles");
  revalidatePath(`/users/roles/${role.id}`);
  redirect(`/users/roles/${role.id}?success=Role+created`);
}

export async function updateRole(id: string, formData: FormData) {
  const session = await requireSuperAdmin();

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
    prisma.role.update({ where: { id }, data: { name, description, updatedById: session.userId } }),
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({ data: rows.map((r) => ({ roleId: id, ...r })) }),
  ]);

  revalidatePath("/users/roles");
  revalidatePath(`/users/roles/${id}`);
  redirect(`/users/roles/${id}?success=Role+updated`);
}

export async function deleteRole(id: string) {
  await requireSuperAdmin();

  const role = await prisma.role.findUnique({
    where: { id },
    select: { isSystem: true, _count: { select: { memberships: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("System roles cannot be deleted");
  if (role._count.memberships > 0) {
    throw new Error(
      `Cannot delete: ${role._count.memberships} membership(s) use this role. Reassign them first.`,
    );
  }

  await prisma.role.delete({ where: { id } });

  revalidatePath("/users/roles");
  redirect("/users/roles?success=Role+deleted");
}

/**
 * Copy a role and all its permission rows.
 *
 * This is the only way to customize a system role: syncSystemRole rewrites
 * Admin / User / Viewer on every seed run, and the UI holds them read-only.
 * Duplicating Viewer is the intended path to a narrow role like "Venue Rep" —
 * far cheaper than filling a 21-resource by 3-scope matrix by hand.
 */
export async function duplicateRole(id: string) {
  const session = await requireSuperAdmin();

  const source = await prisma.role.findUnique({
    where: { id },
    include: { permissions: true },
  });
  if (!source) throw new Error("Role not found");

  // Names are unique, so a second copy of the same role needs its own suffix.
  const base = `${source.name} (Copy)`;
  const taken = new Set(
    (
      await prisma.role.findMany({
        where: { name: { startsWith: base } },
        select: { name: true },
      })
    ).map((r) => r.name),
  );
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;

  const created = await prisma.role.create({
    data: {
      name,
      description: source.description,
      isSystem: false,
      updatedById: session.userId,
      permissions: {
        create: source.permissions.map((p) => ({
          resource: p.resource,
          scope: p.scope,
          level: p.level,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/users/roles");
  redirect(`/users/roles/${created.id}?success=Role duplicated`);
}
