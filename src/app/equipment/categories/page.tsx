import { redirect } from "next/navigation";
import { optionListHref } from "@/lib/optionCategories";

// Equipment categories are a Settings list.
export default function EquipmentCategoriesPage() {
  redirect(optionListHref("equipment_category"));
}
