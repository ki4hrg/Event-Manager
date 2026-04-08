import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  LANDING_PAGE: "landing_page",
  LAST_EVENT_ID: "last_event_id",
} as const;

export type LandingPageOption = "dashboard" | "events" | "last_event";

export const VALID_LANDING_PAGES: LandingPageOption[] = ["dashboard", "events", "last_event"];

export async function getUserSetting(userId: string, key: string): Promise<string | null> {
  const setting = await prisma.userSetting.findUnique({
    where: { userId_key: { userId, key } },
    select: { value: true },
  });
  return setting?.value ?? null;
}

export async function setUserSetting(userId: string, key: string, value: string): Promise<void> {
  await prisma.userSetting.upsert({
    where: { userId_key: { userId, key } },
    update: { value },
    create: { userId, key, value },
  });
}

export async function getUserLandingPage(userId: string): Promise<LandingPageOption> {
  const value = await getUserSetting(userId, SETTING_KEYS.LANDING_PAGE);
  if (value && (VALID_LANDING_PAGES as string[]).includes(value)) {
    return value as LandingPageOption;
  }
  return "dashboard";
}

export async function getLastEventId(userId: string): Promise<string | null> {
  return getUserSetting(userId, SETTING_KEYS.LAST_EVENT_ID);
}
