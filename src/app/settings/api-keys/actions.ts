"use server";

import { revalidatePath } from "next/cache";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

// Admin master list: returns every API key across all users (including
// revoked) so an admin can audit and revoke when needed. Self-service minting
// stays under /account/api-keys.
//
// Gated by API_KEYS (not SETTINGS) so a custom role can grant key-audit
// capability without also granting unrelated settings powers — and vice
// versa, a role with SETTINGS:WRITE for dropdown management can't
// accidentally revoke other users' API keys.
export async function getAllApiKeys() {
  await requirePermission(PermissionResource.API_KEYS, "VIEW");
  return prisma.apiKey.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [
      { revokedAt: { sort: "asc", nulls: "first" } },
      { user: { email: "asc" } },
      { createdAt: "desc" },
    ],
  });
}

export async function adminRevokeApiKey(id: string): Promise<void> {
  await requirePermission(PermissionResource.API_KEYS, "DELETE");
  // Set revokedAt unconditionally — no scope filter, since admins can revoke
  // any key. updateMany returns count 0 if id is unknown; we don't surface a
  // 404 (consistent with the self-service action's behavior).
  await prisma.apiKey.updateMany({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings/api-keys");
}
