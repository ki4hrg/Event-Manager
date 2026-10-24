import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { OPTION_CATEGORIES, OPTION_SECTIONS, isOptionCategory, sectionOf } from "@/lib/optionCategories";
import { OptionCategoryEditor } from "../../OptionCategoryEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  return { title: isOptionCategory(category) ? OPTION_CATEGORIES[category].title : "Settings" };
}

// One option list, from the registry. The settings layout admits SETTINGS
// view; a list edited under another resource (equipment categories, location
// types) needs that resource's view too.
export default async function OptionListPage({ params }: Props) {
  const { category } = await params;
  if (!isOptionCategory(category)) notFound();
  await requirePermission(OPTION_CATEGORIES[category].resource, "VIEW");

  return (
    <div className="max-w-3xl">
      <PageHeader title={OPTION_SECTIONS[sectionOf(category)].title} />
      <div className="space-y-8">
        <OptionCategoryEditor category={category} />
      </div>
    </div>
  );
}
