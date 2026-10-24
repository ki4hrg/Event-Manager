"use server";

import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { sendTestEmail } from "@/lib/email";
import { UserFacingError, withUserErrors } from "@/lib/userErrors";

export async function sendTestEmailAction(formData: FormData) {
  await requirePermission(PermissionResource.SYSTEM, "WRITE");
  return withUserErrors(async () => {
    const to = ((formData.get("to") as string) || "").trim();
    if (!to) throw new UserFacingError("Recipient email is required");
    // Why the send failed is what this platform-admin diagnostic is for.
    try {
      await sendTestEmail(to);
    } catch (e) {
      throw new UserFacingError(e instanceof Error ? e.message : "Send failed.");
    }
  });
}
