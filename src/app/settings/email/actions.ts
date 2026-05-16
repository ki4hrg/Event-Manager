"use server";

import { requireAdmin } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";

export async function sendTestEmailAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const to = ((formData.get("to") as string) || "").trim();
  if (!to) throw new Error("Recipient email is required");
  await sendTestEmail(to);
}
