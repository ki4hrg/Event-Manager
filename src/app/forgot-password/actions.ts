"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { PASSWORD_RESET_PER_EMAIL, PASSWORD_RESET_PER_IP, clientIp, rateLimit } from "@/lib/rateLimit";

// Auth-free by design — same carve-out as `/share/*` report readers.
// Never reveal whether an email is registered. A throttled request skips the
// send and answers exactly like any other.
// An address no longer than the protocol allows; anything else is answered
// like an unknown address (and never reaches the rate limiter's keys).
const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const parsed = EmailSchema.safeParse(formData.get("email"));
  const email = parsed.success ? parsed.data : null;

  if (
    email &&
    rateLimit(PASSWORD_RESET_PER_IP, await clientIp()).allowed &&
    rateLimit(PASSWORD_RESET_PER_EMAIL, email).allowed
  ) {
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
