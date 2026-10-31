"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumePasswordResetToken } from "@/lib/email";
import { UserFacingError, withUserErrors, type UserError } from "@/lib/userErrors";

// bcrypt reads only the first 72 bytes; a longer password would be silently
// truncated, so refuse it instead.
const BCRYPT_MAX_BYTES = 72;

const ResetSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .refine((p) => Buffer.byteLength(p, "utf8") <= BCRYPT_MAX_BYTES, "Password must be at most 72 bytes."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

// Auth-free: the public entry point for the token-based password flow; the
// token is the access. Refusals come back as { error } so the person sees
// them (a thrown message is replaced in production).
export async function setNewPassword(formData: FormData): Promise<void | UserError> {
  return withUserErrors(async () => {
    const parsed = ResetSchema.safeParse({
      token: field(formData, "token"),
      password: field(formData, "password"),
      confirm: field(formData, "confirm"),
    });
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0].message);
    const { token, password } = parsed.data;

    const expired = new UserFacingError("This link is no longer valid. Request a new one from the sign-in page.");
    const valid = await consumePasswordResetToken(token);
    if (!valid) throw expired;

    const hashed = await bcrypt.hash(password, 10);
    // Claim the token and set the password together. The claim only succeeds
    // while the token is unused, so two submissions of one link can't both
    // set a password.
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: valid.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) return false;
      await tx.user.update({ where: { id: valid.userId }, data: { password: hashed } });
      return true;
    });
    if (!claimed) throw expired;

    redirect("/login?success=Password+set.+Please+sign+in.");
  });
}
