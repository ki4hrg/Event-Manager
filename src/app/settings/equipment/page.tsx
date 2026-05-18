import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions, getEquipment, createEquipment, updateEquipment, deleteEquipment } from "../actions";
import { OptionList } from "../OptionList";
import { EquipmentList } from "../EquipmentList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Equipment" };

export default async function SettingsEquipmentPage() {
  const [equipmentCategories, equipment] = await Promise.all([
    getOptions("equipment_category"),
    getEquipment(),
  ]);

  const createEquipmentCategory = async (formData: FormData) => {
    "use server";
    await createOption("equipment_category", formData);
  };
  const reorderEquipmentCategories = async (ids: string[]) => {
    "use server";
    await reorderOptions("equipment_category", ids);
  };

  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createEquipment(formData);
  };
  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateEquipment(id, formData);
  };
  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteEquipment(id);
  };

  return (
    <div className="space-y-8">
      <OptionList
        title="Equipment Categories"
        description="Categories for organizing equipment (e.g., AV, Tables, Chairs). Tables and Chairs are system categories and cannot be deleted."
        category="equipment_category"
        options={equipmentCategories}
        showColor={false}
        showModels={true}
        createOption={createEquipmentCategory}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderEquipmentCategories}
      />
      <EquipmentList
        equipment={equipment}
        categories={equipmentCategories}
        createEquipment={createEquipmentAction}
        updateEquipment={updateEquipmentAction}
        deleteEquipment={deleteEquipmentAction}
      />
    </div>
  );
}
