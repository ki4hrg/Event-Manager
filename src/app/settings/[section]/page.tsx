import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LEGACY_SETTINGS_TABS, OPTION_SECTIONS, categoriesInSection, isSettingsSection } from "@/lib/optionCategories";
import { OptionCategoryEditor } from "../OptionCategoryEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: isSettingsSection(section) ? OPTION_SECTIONS[section].title : "Settings" };
}

// Every option list in one settings section, from the registry. The old
// per-topic tabs (/settings/functions, …) redirect to their section.
export default async function SettingsSectionPage({ params }: Props) {
  const { section } = await params;
  if (!isSettingsSection(section)) {
    const moved = Object.hasOwn(LEGACY_SETTINGS_TABS, section) ? LEGACY_SETTINGS_TABS[section] : null;
    if (moved) redirect(OPTION_SECTIONS[moved].href);
    notFound();
  }

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      {categoriesInSection(section).map((category) => (
        <OptionCategoryEditor key={category} category={category} />
      ))}
    </div>
  );
}
