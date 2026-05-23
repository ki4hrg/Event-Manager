import type { Metadata } from "next";
import {
  getEquipment,
  getEquipmentCategories,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  createEquipmentCategory,
  updateEquipmentCategory,
  deleteEquipmentCategory,
  reorderEquipmentCategories,
} from "./actions";
import { OptionList } from "@/app/settings/OptionList";
import { EquipmentList } from "./EquipmentList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Equipment" };

export default async function EquipmentPage() {
  const [categories, equipment] = await Promise.all([
    getEquipmentCategories(),
    getEquipment(),
  ]);

  return (
    <div className="space-y-8">
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
      <EquipmentList
        equipment={equipment}
        categories={categories}
        createEquipment={createEquipment}
        updateEquipment={updateEquipment}
        deleteEquipment={deleteEquipment}
      />
    </div>
  );
}
