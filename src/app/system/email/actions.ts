"use server";

import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { sendTestEmail } from "@/lib/email";

export async function sendTestEmailAction(formData: FormData): Promise<void> {
  await requirePermission(PermissionResource.SYSTEM, "WRITE");
  const to = ((formData.get("to") as string) || "").trim();
  if (!to) throw new Error("Recipient email is required");
  await sendTestEmail(to);
}
