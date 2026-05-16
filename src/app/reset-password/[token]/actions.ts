"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { consumePasswordResetToken } from "@/lib/email";

// Auth-free: this is the public entry point for the token-based password flow.
export async function setNewPassword(formData: FormData): Promise<void> {
  const token = (formData.get("token") as string) || "";
  const password = (formData.get("password") as string) || "";
  const confirm = (formData.get("confirm") as string) || "";

  if (!token) throw new Error("Missing token");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  if (password !== confirm) throw new Error("Passwords don't match");

  const valid = await consumePasswordResetToken(token);
  if (!valid) throw new Error("This link is no longer valid. Request a new one from the sign-in page.");

  const hashed = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: valid.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: valid.userId },
      data: { password: hashed },
    }),
  ]);

  redirect("/login?success=Password+set.+Please+sign+in.");
}
