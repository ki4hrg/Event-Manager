"use server";

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getUsers() {
  await requirePermission(PermissionResource.USERS, "VIEW");
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      roleId: true,
      roleRef: { select: { id: true, name: true, isSystem: true } },
      createdAt: true,
    },
    orderBy: { email: "asc" },
  });
}

export async function getUser(id: string) {
  await requirePermission(PermissionResource.USERS, "VIEW");
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      roleId: true,
      roleRef: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

export async function createUser(formData: FormData) {
  const session = await requirePermission(PermissionResource.USERS, "WRITE");

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const roleId = (formData.get("roleId") as string) || "";

  if (!email) {
    throw new Error("Email is required");
  }
  if (!roleId) {
    throw new Error("Role is required");
  }

  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new Error("Selected role no longer exists");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("A user with this email already exists");
  }

  const newUser = await prisma.user.create({
    data: {
      email,
      name,
      password: null,
      roleId,
      updatedById: session.user.id,
    },
    select: { id: true, email: true, name: true },
  });

  let sendFailed = false;
  try {
    await sendInviteEmail(newUser);
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

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const submittedRoleId = (formData.get("roleId") as string) || "";

  if (!email) {
    throw new Error("Email is required");
  }

  const current = await prisma.user.findUnique({
    where: { id },
    select: { roleId: true },
  });
  if (!current) throw new Error("User not found");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) {
    throw new Error("A user with this email already exists");
  }

  const isSelf = session.user.id === id;

  // Self-edit can't change role; otherwise resolve the submitted role.
  let nextRoleId: string | null = current.roleId;
  if (!isSelf) {
    if (!submittedRoleId) throw new Error("Role is required");
    const role = await prisma.role.findUnique({
      where: { id: submittedRoleId },
      select: { id: true },
    });
    if (!role) throw new Error("Selected role no longer exists");
    nextRoleId = submittedRoleId;
  }

  await prisma.user.update({
    where: { id },
    data: {
      email,
      name,
      roleId: nextRoleId,
      updatedById: session.user.id,
    },
  });

  revalidatePath("/users");
  redirect(`/users/${id}?success=User+updated+successfully`);
}

export async function resendPasswordResetEmail(userId: string): Promise<void> {
  await requirePermission(PermissionResource.USERS, "WRITE");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new Error("User not found");

  await sendPasswordResetEmail(user);
  revalidatePath(`/users/${userId}`);
}

export async function deleteUser(id: string) {
  const session = await requirePermission(PermissionResource.USERS, "DELETE");

  if (session.user.id === id) {
    throw new Error("You cannot delete your own account");
  }

  await prisma.user.delete({ where: { id } });

  revalidatePath("/users");
  redirect("/users");
}
