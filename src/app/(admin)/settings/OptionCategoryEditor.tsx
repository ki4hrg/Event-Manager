import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  OPTION_CATEGORIES,
  groupChoices,
  isMergeable,
  offListLabels,
  optionLabelUses,
  type OptionCategory,
  type OptionCategoryDef,
} from "@/lib/optionCategories";
import { OptionList } from "./OptionList";
import { OffListLabels } from "./OffListLabels";

// One option list, rendered from its registry entry: the shared editor behind
// /settings/lists/[category], /settings/search, /equipment/categories and
// /storage-locations/types. `query` (search) marks the matching options.
// Gates on the list's own resource; the caller's layout supplies the
// PermissionsProvider that hides controls from VIEW-only users.
export async function OptionCategoryEditor({ category, query }: { category: OptionCategory; query?: string }) {
  const def: OptionCategoryDef = OPTION_CATEGORIES[category];
  const { tenantId } = await requirePermission(def.resource, "VIEW");
  const [options, uses, groups] = await Promise.all([
    prisma.customOption.findMany({ where: { tenantId, category }, orderBy: { sortOrder: "asc" } }),
    optionLabelUses(prisma, tenantId, category),
    groupChoices(prisma, tenantId, category),
  ]);
  const mergeable = isMergeable(category);
  const source = def.groups;
  const fallbackGroup = source?.kind === "fixed" ? source.fallback : undefined;
  const common = {
    category,
    resource: def.resource,
    uses: Object.fromEntries(options.map((o) => [o.label, uses.get(o.label) ?? 0])),
    showColor: !!def.color,
    showModels: !!def.models,
    mergeable,
    fallbackGroup,
    query,
  };

  if (source?.kind === "fixed" && source.split) {
    return (
      <>
        {source.choices.map((g) => (
          <div key={g.value} id={`${category}-${g.value.toLowerCase()}`} className="min-w-0 scroll-mt-24">
            <OptionList
              {...common}
              title={g.label}
              description={g.description ?? ""}
              options={options.filter((o) => o.group === g.value)}
              groupOptions={groups}
              fixedGroup={g.value}
            />
          </div>
        ))}
      </>
    );
  }

  const offList = mergeable ? offListLabels(uses, options) : [];

  return (
    <div id={category} className="space-y-4 min-w-0 scroll-mt-24">
      <OptionList
        {...common}
        title={def.title}
        description={def.description}
        options={options}
        groupOptions={groups}
        groupLabel={source?.label}
      />
      <OffListLabels
        category={category}
        resource={def.resource}
        title={`${def.title} not in the list`}
        labels={offList}
        options={options.map((o) => ({ id: o.id, label: o.label, group: o.group }))}
        groups={groups}
        fallbackGroup={fallbackGroup}
      />
    </div>
  );
}
