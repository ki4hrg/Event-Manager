"use server";

import { z } from "zod";

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleWithinCeiling, requirePermission } from "@/lib/permissions";
import { isSuperAdmin, requireSuperAdmin } from "@/lib/tenant";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { UserFacingError, withUserErrors } from "@/lib/userErrors";
import { redirect } from "next/navigation";
import { assertIds } from "@/lib/validation";

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
  showDiagnostics: true,
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
  assertIds(id);
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

// The email and name the user form posts. The email is a global sign-in, so
// it must be one; the name is optional and bounded.
function isEmail(email: string) {
  return email.length <= 254 && z.email().safeParse(email).success;
}
function readUserFields(formData: FormData) {
  const raw = formData.get("email");
  const email = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!email) throw new UserFacingError("Email is required");

  const rawName = formData.get("name");
  const name = (typeof rawName === "string" ? rawName : "").trim() || null;
  if (name && name.length > 200) throw new UserFacingError("Name must be at most 200 characters");
  return { email, name };
}

async function resolveRole(roleId: string) {
  if (!roleId) throw new UserFacingError("Role is required");
  assertIds(roleId);
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, name: true },
  });
  if (!role) throw new UserFacingError("Selected role no longer exists");
  return role;
}

export async function createUser(formData: FormData) {
  const session = await requirePermission(PermissionResource.USERS, "WRITE");
  return withUserErrors(async () => {
    const tenantId = session.tenantId;

    const { email, name } = readUserFields(formData);
    if (!isEmail(email)) throw new UserFacingError("Enter a valid email address");
    const roleId = (formData.get("roleId") as string) || "";
    // Only a super admin may mint another super admin; the field is ignored
    // from anyone else even if they forge it into the form.
    const superAdmin = await isSuperAdmin();
    const makeSuperAdmin = superAdmin && formData.get("isSuperAdmin") === "true";
    const showDiagnostics = superAdmin && formData.get("showDiagnostics") === "true";

    const role = await resolveRole(roleId);
    await assertRoleWithinCeiling(session.user.id, tenantId, role.id);

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
        throw new UserFacingError("A user with this email is already a member here");
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
        showDiagnostics,
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
  });
}

export async function updateUser(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.USERS, "WRITE");
  return withUserErrors(async () => {
    assertIds(id);
    const tenantId = session.tenantId;
    const superAdmin = await isSuperAdmin();

    const { email, name } = readUserFields(formData);
    const submittedRoleId = (formData.get("roleId") as string) || "";


    const current = await prisma.user.findFirst({
      where: superAdmin ? { id } : { id, memberships: { some: { tenantId } } },
      select: {
        email: true,
        isSuperAdmin: true,
        showDiagnostics: true,
        memberships: { where: { tenantId }, select: { id: true, roleId: true } },
        _count: { select: { memberships: true } },
      },
    });
    if (!current) throw new Error("User not found");
    // Editing someone else (their email above all: a reset link follows it) is
    // within the role ceiling too (#284).
    if (session.user.id !== id && current.memberships[0]) {
      await assertRoleWithinCeiling(session.user.id, tenantId, current.memberships[0].roleId);
    }
    // Checked only when it changes: a stored address the check is stricter than
    // must not block editing the rest of the account.
    if (email !== current.email && !isEmail(email)) throw new UserFacingError("Enter a valid email address");
    // The email is the sign-in (and password-reset) address of a global
    // account: one tenant's admin may not re-point it for an account that also
    // belongs to another organization or is a platform admin.
    if (!superAdmin && email !== current.email && (current.isSuperAdmin || current._count.memberships > 1)) {
      throw new UserFacingError("This account belongs to other organizations too; only a platform admin can change its email");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      throw new UserFacingError("A user with this email already exists");
    }

    const isSelf = session.user.id === id;

    // Self-edit can't change role or platform-admin status; otherwise resolve
    // the submitted role for the membership in this tenant.
    const membership = current.memberships[0];
    let nextRoleId: string | null = membership?.roleId ?? null;
    if (!isSelf && membership) {
      nextRoleId = (await resolveRole(submittedRoleId)).id;
      // Both ends: the role taken away and the role given must be within reach.
      if (nextRoleId !== membership.roleId) {
        await assertRoleWithinCeiling(session.user.id, tenantId, membership.roleId);
        await assertRoleWithinCeiling(session.user.id, tenantId, nextRoleId);
      }
    }
    let nextSuperAdmin = current.isSuperAdmin;
    let nextDiagnostics = current.showDiagnostics;
    if (!isSelf && superAdmin && formData.has("isSuperAdminField")) {
      nextSuperAdmin = formData.get("isSuperAdmin") === "true";
      nextDiagnostics = formData.get("showDiagnostics") === "true";
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { email, name, isSuperAdmin: nextSuperAdmin, showDiagnostics: nextDiagnostics, updatedById: session.user.id },
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
  });
}

export async function resendPasswordResetEmail(userId: string) {
  const session = await requirePermission(PermissionResource.USERS, "WRITE");
  return withUserErrors(async () => {
    const { tenantId } = session;
    assertIds(userId);
    const superAdmin = await isSuperAdmin();

    const user = await prisma.user.findFirst({
      where: superAdmin ? { id: userId } : { id: userId, memberships: { some: { tenantId } } },
      select: { id: true, email: true, name: true, memberships: { where: { tenantId }, select: { roleId: true } } },
    });
    if (!user) throw new Error("User not found");
    // A reset link takes over the account: only for someone within the caller's ceiling.
    if (session.user.id !== user.id && user.memberships[0]) {
      await assertRoleWithinCeiling(session.user.id, tenantId, user.memberships[0].roleId);
    }

    await sendPasswordResetEmail({ id: user.id, email: user.email, name: user.name });
    revalidatePath(`/users/${userId}`);
  });
}

// Takes the user out of this tenant: the membership and their staff rows on
// this tenant's events. The account itself, and its other memberships, stay.
export async function removeUserFromTenant(id: string) {
  const session = await requirePermission(PermissionResource.USERS, "DELETE");
  return withUserErrors(async () => {
    assertIds(id);
    const tenantId = session.tenantId;

    if (session.user.id === id) {
      throw new UserFacingError("You cannot remove yourself from the organization");
    }

    // Removing a member takes their role away: the caller must be able to give it.
    const removed = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: id } }, select: { roleId: true } });
    if (removed) await assertRoleWithinCeiling(session.user.id, tenantId, removed.roleId);

    await prisma.$transaction([
      prisma.eventStaff.deleteMany({ where: { userId: id, event: { tenantId } } }),
      prisma.tenantMembership.deleteMany({ where: { userId: id, tenantId } }),
    ]);

    revalidatePath("/users");
    redirect("/users?success=User+removed+from+organization");
  });
}

// Deletes the account everywhere. Super admins only: a tenant admin's reach
// ends at their own tenant's membership list.
export async function deleteUser(id: string) {
  const ctx = await requireSuperAdmin();
  assertIds(id);

  if (ctx.userId === id) {
    throw new UserFacingError("You cannot delete your own account");
  }

  await prisma.user.delete({ where: { id } });

  revalidatePath("/users");
  redirect("/users");
}
