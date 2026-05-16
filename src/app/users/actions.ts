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
      role: true,
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
      role: true,
      createdAt: true,
    },
  });
}

export async function createUser(formData: FormData) {
  await requirePermission(PermissionResource.USERS, "WRITE");

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const role = formData.get("role") as string;

  if (!email) {
    throw new Error("Email is required");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("A user with this email already exists");
  }

  const newUser = await prisma.user.create({
    data: {
      email,
      name,
      password: null,
      role: role === "admin" ? "admin" : "user",
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
  const role = formData.get("role") as string;

  if (!email) {
    throw new Error("Email is required");
  }

  const current = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!current) throw new Error("User not found");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) {
    throw new Error("A user with this email already exists");
  }

  const isSelf = session.user.id === id;

  await prisma.user.update({
    where: { id },
    data: {
      email,
      name,
      role: isSelf ? current.role : role === "admin" ? "admin" : "user",
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
