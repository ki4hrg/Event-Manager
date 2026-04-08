"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { setUserSetting, SETTING_KEYS, VALID_LANDING_PAGES, LandingPageOption } from "@/lib/userSettings";

export async function updateLandingPage(formData: FormData): Promise<void> {
  const session = await requireAuth();

  const value = formData.get("landing_page") as string;
  if (!VALID_LANDING_PAGES.includes(value as LandingPageOption)) {
    throw new Error("Invalid landing page option");
  }

  await setUserSetting(session.user.id, SETTING_KEYS.LANDING_PAGE, value);
  redirect("/account?success=Preferences+saved");
}
