import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { permissionLevels } from "@/lib/permissions";
import { canDo } from "@/lib/eventPermissions";
import { requireActiveTenantId } from "@/lib/tenant";
import {
  OPTION_CATEGORIES,
  OPTION_RESOURCES,
  OPTION_SECTIONS,
  categoriesInSection,
  type OptionCategory,
  type OptionSection,
} from "@/lib/optionCategories";
import { OptionCategoryEditor } from "../OptionCategoryEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search" };

const MIN_QUERY = 2;
const MAX_QUERY = 100;

// A usable query, or null: too short matches nearly everything.
function parseQuery(raw: string | string[] | undefined): string | null {
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, MAX_QUERY) ?? "";
  return q.length >= MIN_QUERY ? q : null;
}

const SECTIONS = Object.keys(OPTION_SECTIONS) as OptionSection[];

// Option lists whose title or any option label holds `?q=`, across every
// section the user can view, each with its editor.
export default async function SettingsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const q = parseQuery((await searchParams).q);
  if (!q) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Enter at least {MIN_QUERY} characters.</p>;
  }

  const [tenantId, levels] = await Promise.all([
    requireActiveTenantId(),
    permissionLevels(OPTION_RESOURCES),
  ]);
  const visible = SECTIONS.flatMap(categoriesInSection).filter((c) => canDo(levels, OPTION_CATEGORIES[c].resource, "VIEW"));
  const labelHits = await prisma.customOption.findMany({
    where: { tenantId, category: { in: visible }, label: { contains: q, mode: "insensitive" } },
    select: { category: true },
    distinct: ["category"],
  });
  const hitCategories = new Set(labelHits.map((h) => h.category));
  const needle = q.toLowerCase();
  const matches = new Set<OptionCategory>(
    visible.filter((c) => hitCategories.has(c) || OPTION_CATEGORIES[c].title.toLowerCase().includes(needle)),
  );
  const sections = SECTIONS.map((s) => ({ section: s, categories: categoriesInSection(s).filter((c) => matches.has(c)) })).filter(
    (s) => s.categories.length > 0,
  );

  if (sections.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No lists or options match “{q}”.</p>;
  }

  return (
    <div className="space-y-8">
      {sections.map(({ section, categories }) => (
        <section key={section} className="space-y-4">
          <h2 className="text-sm font-medium">
            <Link href={OPTION_SECTIONS[section].href} className="text-blue-600 dark:text-blue-400 hover:underline">
              {OPTION_SECTIONS[section].home}
            </Link>
          </h2>
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            {categories.map((category) => (
              <OptionCategoryEditor key={category} category={category} query={q} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
