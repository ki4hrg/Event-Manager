"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getUsers() {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();

  const email = formData.get("email") as string;
  const name = (formData.get("name") as string) || null;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const [existing, hashedPassword] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    bcrypt.hash(password, 10),
  ]);

  if (existing) {
    throw new Error("A user with this email already exists");
  }

  await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role: role === "admin" ? "admin" : "user",
    },
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function updateUser(id: string, formData: FormData) {
  const session = await requireAdmin();

  const email = formData.get("email") as string;
  const name = (formData.get("name") as string) || null;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!email) {
    throw new Error("Email is required");
  }

  const [existing, hashedPassword] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    password ? bcrypt.hash(password, 10) : Promise.resolve(undefined),
  ]);

  if (existing && existing.id !== id) {
    throw new Error("A user with this email already exists");
  }

  const isSelf = session.user.id === id;
  const data: { email: string; name: string | null; role: string; password?: string } = {
    email,
    name,
    role: isSelf ? existing!.role : (role === "admin" ? "admin" : "user"),
  };

  if (hashedPassword) {
    data.password = hashedPassword;
  }

  await prisma.user.update({
    where: { id },
    data,
  });

  revalidatePath("/users");
  redirect(`/users/${id}?success=User updated successfully`);
}

export async function deleteUser(id: string) {
  const session = await requireAdmin();

  if (session.user.id === id) {
    throw new Error("You cannot delete your own account");
  }

  await prisma.user.delete({ where: { id } });

  revalidatePath("/users");
  redirect("/users");
}
