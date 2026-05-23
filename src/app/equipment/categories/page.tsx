import type { Metadata } from "next";
import {
  getEquipmentCategories,
  createEquipmentCategory,
  updateEquipmentCategory,
  deleteEquipmentCategory,
  reorderEquipmentCategories,
} from "../actions";
import { OptionList } from "@/app/settings/OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Categories" };

export default async function EquipmentCategoriesPage() {
  const categories = await getEquipmentCategories();

  return (
    <OptionList
      title="Equipment Categories"
      description="Categories for organizing equipment (e.g., AV, Tables, Chairs). Tables and Chairs are system categories and cannot be deleted."
      category="equipment_category"
      options={categories}
      showColor={false}
      showModels={true}
      createOption={createEquipmentCategory}
      updateOption={updateEquipmentCategory}
      deleteOption={deleteEquipmentCategory}
      reorderOptions={reorderEquipmentCategories}
    />
  );
}
