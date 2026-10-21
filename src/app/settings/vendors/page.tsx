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
  type OptionCategory,
} from "../actions";
import { OptionList } from "../OptionList";
import { OffListLabels } from "../hotels/OffListLabels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendor options" };

const LISTS: { category: OptionCategory; title: string; description: string; mergeable?: boolean }[] = [
  { category: "vendor_contact_type", title: "Vendor Contact Types", description: "Roles for vendor contacts (e.g., Sales, Billing, Technical)" },
  { category: "rfp_service", title: "RFP Services", description: "What an Other services RFP is for" },
  { category: "rfp_term", title: "RFP Terms", description: "", mergeable: true },
];

export default async function SettingsVendorsPage() {
  const [options, offList] = await Promise.all([
    Promise.all(LISTS.map((l) => getOptions(l.category))),
    Promise.all(LISTS.map((l) => (l.mergeable ? getOffListLabels(l.category) : []))),
  ]);

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      {LISTS.map((list, i) => {
        const create = async (formData: FormData) => {
          "use server";
          await createOption(list.category, formData);
        };
        const reorder = async (ids: string[]) => {
          "use server";
          await reorderOptions(list.category, ids);
        };
        const map = async (label: string, intoId: string) => {
          "use server";
          await mapOffListLabel(list.category, label, intoId);
        };
        const add = async (label: string) => {
          "use server";
          const formData = new FormData();
          formData.set("label", label);
          await createOption(list.category, formData);
        };
        return (
          <div key={list.category} className="space-y-4 min-w-0">
            <OptionList
              title={list.title}
              description={list.description}
              category={list.category}
              options={options[i]}
              showColor={false}
              createOption={create}
              updateOption={updateOption}
              deleteOption={deleteOption}
              reorderOptions={reorder}
              mergeOption={list.mergeable ? mergeOption : undefined}
            />
            {list.mergeable && (
              <OffListLabels
                title={`${list.title} not in the list`}
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
