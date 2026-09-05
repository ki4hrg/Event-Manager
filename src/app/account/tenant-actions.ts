"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { setActiveTenantForUser } from "@/lib/tenant";

// Header switcher. Lands on the dashboard rather than the current page: the
// page the user was on belongs to the tenant they just left.
export async function switchTenant(tenantId: string) {
  const session = await requireAuth();
  const ok = await setActiveTenantForUser(session.user.id, tenantId);
  if (!ok) throw new Error("You are not a member of that organization");
  revalidatePath("/", "layout");
  redirect("/");
}
