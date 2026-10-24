import type { Metadata } from "next";
import {
  getOptions,
  getOffListLabels,
  createOption,
  updateOption,
  deleteOption,
  reorderOptions,
  mergeOption,
  mapOffListLabel,
} from "../actions";
import { OptionList } from "../OptionList";
import { OffListLabels } from "../hotels/OffListLabels";
import { OPTION_CATEGORIES, categoriesInSection } from "@/lib/optionCategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendor options" };

const LISTS = categoriesInSection("vendors");

export default async function SettingsVendorsPage() {
  const [options, offList] = await Promise.all([
    Promise.all(LISTS.map((c) => getOptions(c))),
    Promise.all(LISTS.map((c) => getOffListLabels(c))),
  ]);

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      {LISTS.map((category, i) => {
        const def = OPTION_CATEGORIES[category];
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
              showColor={false}
              createOption={create}
              updateOption={updateOption}
              deleteOption={deleteOption}
              reorderOptions={reorder}
              mergeOption={mergeable ? mergeOption : undefined}
            />
            {mergeable && (
              <OffListLabels
                title={`${def.title} not in the list`}
                labels={offList[i]}
                options={options[i].map((o) => ({ id: o.id, label: o.label, group: o.group }))}
                map={map}
                add={add}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
