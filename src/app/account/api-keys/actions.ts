"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateApiKey } from "@/lib/mcpAuth";
import { assertIds } from "@/lib/validation";
import { type UserError, UserFacingError, withUserErrors } from "@/lib/userErrors";

export async function getApiKeys() {
  const session = await requireAuth();
  return prisma.apiKey.findMany({
    where: { userId: session.user.id },
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
  });
}

// One-of-a-kind: this action returns the freshly generated key so the client
// can show it to the user exactly once. We never store the plaintext — the
// hashedKey is SHA-256(fullKey). This is the deliberate exception to the
// "actions return void / redirect" convention, documented in CLAUDE.md.
export async function mintApiKey(formData: FormData): Promise<{
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string;
  createdAt: Date;
} | UserError> {
  const session = await requireAuth();
  return withUserErrors(async () => {
  const raw = formData.get("name");
  const name = (typeof raw === "string" ? raw : "").trim();
  if (!name) throw new UserFacingError("Name is required");
  if (name.length > 100) throw new UserFacingError("Name must be at most 100 characters");

  const { fullKey, keyPrefix, hashedKey } = generateApiKey();

  const created = await prisma.apiKey.create({
    data: { userId: session.user.id, name, keyPrefix, hashedKey },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });

  revalidatePath("/account/api-keys");
  return { ...created, fullKey };
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  const session = await requireAuth();
  assertIds(id);
  // Scope the update by userId so a user can only revoke their own keys, even
  // if they guess another key's id. updateMany returns count 0 on no match —
  // we don't surface a 404 because that would leak existence.
  await prisma.apiKey.updateMany({
    where: { id, userId: session.user.id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/account/api-keys");
}
