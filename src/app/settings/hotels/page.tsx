import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions, type OptionCategory } from "../actions";
import { OptionList } from "../OptionList";
import { PROPOSAL_STAGES } from "@/lib/hotels";
import { CONCESSION_GROUPS } from "@/lib/rfp/sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotel options" };

const LISTS: { category: OptionCategory; title: string; description: string; showColor?: boolean }[] = [
  { category: "proposal_status", title: "Proposal Statuses", description: "Stage drives the workflow.", showColor: true },
  { category: "hotel_room_type", title: "Room Types", description: "" },
  { category: "hotel_guest_type", title: "Guest Types", description: "" },
  { category: "hotel_amenity", title: "Amenities", description: "" },
  { category: "hotel_lead_source", title: "Lead Sources", description: "" },
  { category: "hotel_brand", title: "Brands", description: "" },
  { category: "hotel_region", title: "Regions", description: "" },
  { category: "hotel_area", title: "Areas", description: "" },
  { category: "rfp_concession", title: "Concessions", description: "" },
];

export default async function SettingsHotelsPage() {
  const options = await Promise.all(LISTS.map((l) => getOptions(l.category)));
  const regions = options[LISTS.findIndex((l) => l.category === "hotel_region")];

  const groupsFor = (category: OptionCategory) => {
    if (category === "proposal_status") {
      return { groupLabel: "Stage", groupOptions: PROPOSAL_STAGES.map((s) => ({ value: s.value, label: s.label })) };
    }
    if (category === "rfp_concession") {
      return { groupLabel: "Heading", groupOptions: CONCESSION_GROUPS.map((g) => ({ value: g.value, label: g.label })) };
    }
    if (category === "hotel_area") {
      return { groupLabel: "Region", groupOptions: regions.map((r) => ({ value: r.label, label: r.label })) };
    }
    return {};
  };

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
            showColor={list.showColor ?? false}
            {...groupsFor(list.category)}
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
