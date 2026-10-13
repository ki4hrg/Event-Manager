"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, slugifyTenantName } from "@/lib/tenant";
import { orgProfileFromForm, orgProfileSelect } from "@/lib/orgProfile";
import { createTenantCore } from "./core";

// Everything here is super-admin only: tenants and cross-tenant membership are
// platform administration, above any single tenant's roles.

export async function getTenants() {
  await requireSuperAdmin();
  return prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: { select: { memberships: true, events: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getTenant(id: string) {
  await requireSuperAdmin();
  return prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      ...orgProfileSelect,
      createdAt: true,
      updatedAt: true,
      _count: { select: { events: true, venues: true, contacts: true, vendors: true } },
      memberships: {
        select: {
          id: true,
          user: { select: { id: true, email: true, name: true, isSuperAdmin: true } },
          role: { select: { id: true, name: true } },
        },
        orderBy: { user: { email: "asc" } },
      },
    },
  });
}

// Every account, for the add-member picker.
export async function getUserOptions() {
  await requireSuperAdmin();
  return prisma.user.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
  });
}

export async function createTenant(formData: FormData) {
  await requireSuperAdmin();
  const tenant = await createTenantCore(
    (formData.get("name") as string) || "",
    (formData.get("slug") as string) || null,
    orgProfileFromForm(formData),
  );
  revalidatePath("/tenants");
  redirect(`/tenants/${tenant.id}?success=Tenant+created`);
}

export async function updateTenant(id: string, formData: FormData) {
  await requireSuperAdmin();
  const name = ((formData.get("name") as string) || "").trim();
  const slug = slugifyTenantName((formData.get("slug") as string) || name);
  if (!name) throw new Error("Name is required");
  if (!slug) throw new Error("Slug must contain at least one letter or number");

  const clash = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (clash && clash.id !== id) throw new Error("A tenant with this slug already exists");

  await prisma.tenant.update({ where: { id }, data: { name, slug, ...orgProfileFromForm(formData) } });
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  redirect(`/tenants/${id}?success=Tenant+updated`);
}

// Cascades through every event, venue, contact, vendor, and catalog row the
// tenant owns. The confirm step on the button is the only guard.
export async function deleteTenant(id: string) {
  await requireSuperAdmin();
  const count = await prisma.tenant.count();
  if (count <= 1) throw new Error("The last tenant cannot be deleted");
  await prisma.tenant.delete({ where: { id } });
  revalidatePath("/tenants");
  revalidatePath("/", "layout");
  redirect("/tenants?success=Tenant+deleted");
}

// --- Memberships (user <-> tenant with a role) ---

function revalidateMembership(tenantId: string, userId: string) {
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  // The header switcher lists memberships on every page.
  revalidatePath("/", "layout");
}

export async function addMembership(tenantId: string, userId: string, roleId: string) {
  await requireSuperAdmin();
  if (!userId) throw new Error("User is required");
  if (!roleId) throw new Error("Role is required");
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { roleId },
    create: { tenantId, userId, roleId },
  });
  revalidateMembership(tenantId, userId);
}

export async function setMembershipRole(tenantId: string, userId: string, roleId: string) {
  await requireSuperAdmin();
  if (!roleId) throw new Error("Role is required");
  await prisma.tenantMembership.update({
    where: { tenantId_userId: { tenantId, userId } },
    data: { roleId },
  });
  revalidateMembership(tenantId, userId);
}

export async function removeMembership(tenantId: string, userId: string) {
  await requireSuperAdmin();
  await prisma.$transaction([
    prisma.eventStaff.deleteMany({ where: { userId, event: { tenantId } } }),
    prisma.tenantMembership.deleteMany({ where: { tenantId, userId } }),
  ]);
  revalidateMembership(tenantId, userId);
}
