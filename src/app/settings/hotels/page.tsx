import type { Metadata } from "next";
import {
  getOptions,
  createOption,
  updateOption,
  deleteOption,
  reorderOptions,
  mergeOption,
  getOffListLabels,
  mapOffListLabel,
} from "../actions";
import { OffListLabels } from "./OffListLabels";
import { OptionList } from "../OptionList";
import { prisma } from "@/lib/prisma";
import { requireActiveTenantId } from "@/lib/tenant";
import { OPTION_CATEGORIES, categoriesInSection, groupChoices, type GroupSource } from "@/lib/optionCategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotel options" };

const LISTS = categoriesInSection("hotels");

export default async function SettingsHotelsPage() {
  const tenantId = await requireActiveTenantId();
  const [options, offList, groups] = await Promise.all([
    Promise.all(LISTS.map((c) => getOptions(c))),
    Promise.all(LISTS.map((c) => getOffListLabels(c))),
    Promise.all(LISTS.map((c) => groupChoices(prisma, tenantId, c))),
  ]);

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      {LISTS.map((category, i) => {
        const def = OPTION_CATEGORIES[category];
        const source: GroupSource | undefined = "groups" in def ? def.groups : undefined;
        const fallbackGroup = source?.kind === "fixed" ? source.fallback : undefined;
        const mergeable = "mergeable" in def;
        const create = async (formData: FormData) => {
          "use server";
          await createOption(category, formData);
        };
        const reorder = async (ids: string[]) => {
          "use server";
          await reorderOptions(category, ids);
        };
        const map = async (label: string, intoId: string) => {
          "use server";
          await mapOffListLabel(category, label, intoId);
        };
        const add = async (label: string) => {
          "use server";
          const formData = new FormData();
          formData.set("label", label);
          await createOption(category, formData);
        };
        return (
          <div key={category} className="space-y-4 min-w-0">
            <OptionList
              title={def.title}
              description={def.description}
              category={category}
              options={options[i]}
              showColor={"color" in def && def.color}
              groupLabel={source?.label}
              groupOptions={groups[i]}
              createOption={create}
              updateOption={updateOption}
              deleteOption={deleteOption}
              reorderOptions={reorder}
              mergeOption={mergeable ? mergeOption : undefined}
              fallbackGroup={fallbackGroup}
            />
            <OffListLabels
              title={`${def.title} not in the list`}
              labels={offList[i]}
              options={options[i].map((o) => ({ id: o.id, label: o.label, group: o.group }))}
              groups={groups[i]}
              fallbackGroup={fallbackGroup}
              map={map}
              add={add}
            />
          </div>
        );
      })}
    </div>
  );
}
