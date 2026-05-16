"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";

// Auth-free by design — same carve-out as `/share/*` report readers.
// Never reveal whether an email is registered.
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();

  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      try {
        await sendPasswordResetEmail(user);
      } catch {
        // Swallow send errors so we don't leak account existence or Mailgun status.
      }
    }
  }

  redirect("/forgot-password?success=If+that+email+is+registered%2C+a+reset+link+is+on+the+way.");
}
