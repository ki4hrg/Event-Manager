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
    <OptionList
      title="Location Types"
      description="Labels for what a location is — Shelf, Pallet, Tote, Trailer. Purely descriptive: whether something travels is set per location by its Place/Container setting."
      category="location_type"
      options={types}
      showColor={true}
      showModels={false}
      createOption={createLocationType}
      updateOption={updateLocationType}
      deleteOption={deleteLocationType}
      reorderOptions={reorderLocationTypes}
    />
  );
}
