import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions, type OptionCategory } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Specification options" };

const LISTS: { category: OptionCategory; title: string; description: string }[] = [
  { category: "event_type", title: "Event Types", description: "Event Type on the Specifications page (ESG §A)." },
  { category: "event_scope", title: "Event Scope", description: "Citywide, single venue, multiple venue, etc. (ESG §A)." },
  { category: "event_frequency", title: "Event Frequency", description: "How often the event recurs (ESG §A)." },
  { category: "reservation_method", title: "Reservation Methods", description: "How attendees book housing (ESG §G)." },
];

export default async function SettingsSpecificationsPage() {
  const options = await Promise.all(LISTS.map((l) => getOptions(l.category)));

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
        return (
          <OptionList
            key={list.category}
            title={list.title}
            description={list.description}
            category={list.category}
            options={options[i]}
            showColor={false}
            createOption={create}
            updateOption={updateOption}
            deleteOption={deleteOption}
            reorderOptions={reorder}
          />
        );
      })}
    </div>
  );
}
