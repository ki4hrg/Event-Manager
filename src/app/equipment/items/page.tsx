import type { Metadata } from "next";
import {
  getEquipment,
  getEquipmentCategories,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} from "../actions";
import { EquipmentList } from "../EquipmentList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Items" };

export default async function EquipmentItemsPage() {
  const [categories, equipment] = await Promise.all([
    getEquipmentCategories(),
    getEquipment(),
  ]);

  return (
    <EquipmentList
      equipment={equipment}
      categories={categories}
      createEquipment={createEquipment}
      updateEquipment={updateEquipment}
      deleteEquipment={deleteEquipment}
    />
  );
}
