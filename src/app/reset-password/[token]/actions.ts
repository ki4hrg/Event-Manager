"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { UserFacingError, withUserErrors, type UserError } from "@/lib/userErrors";

// bcrypt reads only the first 72 bytes; a longer password would be silently
// truncated, so refuse it instead.
const BCRYPT_MAX_BYTES = 72;

const TokenSchema = z.string().min(1).max(200);
const PasswordSchema = z
  .object({
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
    const expired = new UserFacingError("This link is no longer valid. Request a new one from the sign-in page.");
    const token = TokenSchema.safeParse(field(formData, "token"));
    if (!token.success) throw expired;
    const parsed = PasswordSchema.safeParse({ password: field(formData, "password"), confirm: field(formData, "confirm") });
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0].message);

    const hashed = await bcrypt.hash(parsed.data.password, 10);
    // One atomic claim decides: unused and unexpired at the moment of the
    // write. Two submissions of one link can't both set a password, and a link
    // that expires while the password hashes isn't spent.
    const claimed = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.passwordResetToken.updateMany({
        where: { token: token.data, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) return false;
      const row = await tx.passwordResetToken.findUniqueOrThrow({ where: { token: token.data }, select: { userId: true } });
      await tx.user.update({ where: { id: row.userId }, data: { password: hashed } });
      return true;
    });
    if (!claimed) throw expired;

    redirect("/login?success=Password+set.+Please+sign+in.");
  });
}
