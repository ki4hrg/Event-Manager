import { notFound, redirect } from "next/navigation";
import { categoriesInSection, isOptionSection, legacySettingsTab, optionListHref } from "@/lib/optionCategories";

export const dynamic = "force-dynamic";

// An area (/settings/hotels) opens its first list; the old per-topic tabs and
// renamed areas (/settings/functions, /settings/post-event, …) open the list
// they held.
export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const list = isOptionSection(section) ? categoriesInSection(section)[0] : legacySettingsTab(section);
  if (!list) notFound();
  redirect(optionListHref(list));
}
