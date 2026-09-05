"use server";

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { isSuperAdmin, requireSuperAdmin } from "@/lib/tenant";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Users are global accounts; this section administers the active tenant's
// *members* — the users holding a TenantMembership here, and the role each
// holds. Creating a "user" here means inviting an account (new or existing)
// into this tenant. Cross-tenant membership and platform-admin status are
// managed by super admins under /tenants and on the user page.

const userSummarySelect = {
  id: true,
  email: true,
  name: true,
  isSuperAdmin: true,
  createdAt: true,
} as const;

export async function getUsers() {
  const { tenantId } = await requirePermission(PermissionResource.USERS, "VIEW");
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: {
      user: { select: userSummarySelect },
      role: { select: { id: true, name: true, isSystem: true } },
    },
    orderBy: { user: { email: "asc" } },
  });
  return memberships.map((m) => ({ ...m.user, roleId: m.role.id, roleRef: m.role }));
}

// A member of the active tenant, with the role they hold here. Super admins may
// open any account (they manage cross-tenant membership from the same page);
// everyone else sees only their own tenant's members.
export async function getUser(id: string) {
  const { tenantId } = await requirePermission(PermissionResource.USERS, "VIEW");
  const superAdmin = await isSuperAdmin();
  const user = await prisma.user.findFirst({
    where: superAdmin ? { id } : { id, memberships: { some: { tenantId } } },
    select: {
      ...userSummarySelect,
      updatedAt: true,
      updatedBy: { select: { name: true, email: true } },
      memberships: {
        select: {
          tenant: { select: { id: true, name: true, slug: true } },
          role: { select: { id: true, name: true } },
        },
        orderBy: { tenant: { name: "asc" } },
      },
    },
  });
  if (!user) return null;
  const here = user.memberships.find((m) => m.tenant.id === tenantId);
  return {
    ...user,
    roleId: here?.role.id ?? null,
    roleRef: here?.role ?? null,
  };
}

async function resolveRole(roleId: string) {
  if (!roleId) throw new Error("Role is required");
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, name: true },
  });
  if (!role) throw new Error("Selected role no longer exists");
  return role;
}

export async function createUser(formData: FormData) {
  const session = await requirePermission(PermissionResource.USERS, "WRITE");
  const tenantId = session.tenantId;

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const roleId = (formData.get("roleId") as string) || "";
  // Only a super admin may mint another super admin; the field is ignored
  // from anyone else even if they forge it into the form.
  const makeSuperAdmin = (await isSuperAdmin()) && formData.get("isSuperAdmin") === "true";

  if (!email) {
    throw new Error("Email is required");
  }
  const role = await resolveRole(roleId);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, memberships: { where: { tenantId }, select: { id: true } } },
  });

  // An account that already exists elsewhere is added to this tenant rather
  // than duplicated — one login, several tenants.
  if (existing) {
    if (existing.memberships.length > 0) {
      throw new Error("A user with this email is already a member here");
    }
    await prisma.tenantMembership.create({
      data: { tenantId, userId: existing.id, roleId: role.id },
    });
    revalidatePath("/users");
    revalidatePath(`/users/${existing.id}`);
    redirect(`/users/${existing.id}?success=Existing+user+added+to+${encodeURIComponent(tenant?.name ?? "organization")}`);
  }

  const newUser = await prisma.user.create({
    data: {
      email,
      name,
      password: null,
      isSuperAdmin: makeSuperAdmin,
      updatedById: session.user.id,
      memberships: { create: { tenantId, roleId: role.id } },
    },
    select: { id: true, email: true, name: true },
  });

  let sendFailed = false;
  try {
    await sendInviteEmail({ ...newUser, roleName: role.name, tenantName: tenant?.name ?? null });
  } catch {
    sendFailed = true;
  }

  revalidatePath("/users");
  revalidatePath(`/users/${newUser.id}`);

  if (sendFailed) {
    redirect(
      `/users/${newUser.id}?error=User+created+but+invite+email+failed+to+send.+Use+Resend+to+retry.`
    );
  }
  redirect(`/users/${newUser.id}?success=Invite+email+sent`);
}

export async function updateUser(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.USERS, "WRITE");
  const tenantId = session.tenantId;
  const superAdmin = await isSuperAdmin();

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const submittedRoleId = (formData.get("roleId") as string) || "";

  if (!email) {
    throw new Error("Email is required");
  }

  const current = await prisma.user.findFirst({
    where: superAdmin ? { id } : { id, memberships: { some: { tenantId } } },
    select: {
      isSuperAdmin: true,
      memberships: { where: { tenantId }, select: { id: true, roleId: true } },
    },
  });
  if (!current) throw new Error("User not found");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) {
    throw new Error("A user with this email already exists");
  }

  const isSelf = session.user.id === id;

  // Self-edit can't change role or platform-admin status; otherwise resolve
  // the submitted role for the membership in this tenant.
  const membership = current.memberships[0];
  let nextRoleId: string | null = membership?.roleId ?? null;
  if (!isSelf && membership) {
    nextRoleId = (await resolveRole(submittedRoleId)).id;
  }
  let nextSuperAdmin = current.isSuperAdmin;
  if (!isSelf && superAdmin && formData.has("isSuperAdminField")) {
    nextSuperAdmin = formData.get("isSuperAdmin") === "true";
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { email, name, isSuperAdmin: nextSuperAdmin, updatedById: session.user.id },
    }),
    ...(membership && nextRoleId
      ? [
          prisma.tenantMembership.update({
            where: { id: membership.id },
            data: { roleId: nextRoleId },
          }),
        ]
      : []),
  ]);

  revalidatePath("/users");
  redirect(`/users/${id}?success=User+updated+successfully`);
}

export async function resendPasswordResetEmail(userId: string): Promise<void> {
  const { tenantId } = await requirePermission(PermissionResource.USERS, "WRITE");
  const superAdmin = await isSuperAdmin();

  const user = await prisma.user.findFirst({
    where: superAdmin ? { id: userId } : { id: userId, memberships: { some: { tenantId } } },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new Error("User not found");

  await sendPasswordResetEmail(user);
  revalidatePath(`/users/${userId}`);
}

// Takes the user out of this tenant: the membership and their staff rows on
// this tenant's events. The account itself, and its other memberships, stay.
export async function removeUserFromTenant(id: string) {
  const session = await requirePermission(PermissionResource.USERS, "DELETE");
  const tenantId = session.tenantId;

  if (session.user.id === id) {
    throw new Error("You cannot remove yourself from the organization");
  }

  await prisma.$transaction([
    prisma.eventStaff.deleteMany({ where: { userId: id, event: { tenantId } } }),
    prisma.tenantMembership.deleteMany({ where: { userId: id, tenantId } }),
  ]);

  revalidatePath("/users");
  redirect("/users?success=User+removed+from+organization");
}

// Deletes the account everywhere. Super admins only: a tenant admin's reach
// ends at their own tenant's membership list.
export async function deleteUser(id: string) {
  const ctx = await requireSuperAdmin();

  if (ctx.userId === id) {
    throw new Error("You cannot delete your own account");
  }

  await prisma.user.delete({ where: { id } });

  revalidatePath("/users");
  redirect("/users");
}
