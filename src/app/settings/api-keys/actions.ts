"use server";

import { revalidatePath } from "next/cache";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { generateApiKey } from "@/lib/mcpAuth";

export async function getApiKeys() {
  await requirePermission(PermissionResource.API_KEYS, "VIEW");
  return prisma.apiKey.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
  });
}

export async function getApiKeyUsers() {
  await requirePermission(PermissionResource.API_KEYS, "WRITE");
  return prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

// One-of-a-kind: this action returns the freshly generated key so the client
// can show it to the admin exactly once. We never store the plaintext — the
// hashedKey is SHA-256(fullKey). This is the deliberate exception to the
// "actions return void / redirect" convention, documented in CLAUDE.md.
export async function mintApiKey(formData: FormData): Promise<{
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string;
  createdAt: Date;
}> {
  await requirePermission(PermissionResource.API_KEYS, "WRITE");

  const userId = (formData.get("userId") as string) || "";
  const name = ((formData.get("name") as string) || "").trim();
  if (!userId) throw new Error("Select a user");
  if (!name) throw new Error("Name is required");

  const { fullKey, keyPrefix, hashedKey } = generateApiKey();

  const created = await prisma.apiKey.create({
    data: { userId, name, keyPrefix, hashedKey },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });

  revalidatePath("/settings/api-keys");
  return { ...created, fullKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  await requirePermission(PermissionResource.API_KEYS, "DELETE");
  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings/api-keys");
}
