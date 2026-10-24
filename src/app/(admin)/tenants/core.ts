// Pure core for tenant creation. NOT a "use server" file — see
// src/app/contacts/core.ts for the security rationale. Called by the tenants
// Server Actions and by the seed-equivalent path when a super admin creates an
// organization from the UI.

import { prisma } from "@/lib/prisma";
import { slugifyTenantName } from "@/lib/tenant";
import type { OrgProfile } from "@/lib/orgProfile";
import { seedTenantDefaults } from "../../../../prisma/tenantDefaults.mjs";

export async function createTenantCore(name: string, slugInput: string | null, profile?: OrgProfile) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const slug = slugifyTenantName(slugInput?.trim() || trimmed);
  if (!slug) throw new Error("Slug must contain at least one letter or number");

  const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (clash) throw new Error("A tenant with this slug already exists");

  // Defaults land in the same transaction as the row, so a half-seeded tenant
  // can't exist: every tenant has its dropdown options, equipment catalog, and
  // system vendor from its first second.
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: trimmed, slug, ...profile } });
    await seedTenantDefaults(tx, tenant.id);
    return tenant;
  });
}
