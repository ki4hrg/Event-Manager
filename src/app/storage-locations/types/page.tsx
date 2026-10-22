import type { Metadata } from "next";
import {
  getLocationTypes,
  createLocationType,
  updateLocationType,
  deleteLocationType,
  reorderLocationTypes,
} from "../actions";
import { OptionList } from "@/app/settings/OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Types" };

export default async function LocationTypesPage() {
  const types = await getLocationTypes();

  return (
    <div className="max-w-2xl">
      <OptionList
        title="Location Types"
        description="What a location is (e.g., Shelf, Pallet, Tote, Trailer)."
        category="location_type"
        options={types}
        showColor={true}
        showModels={false}
        createOption={createLocationType}
        updateOption={updateLocationType}
        deleteOption={deleteLocationType}
        reorderOptions={reorderLocationTypes}
      />
    </div>
  );
}
