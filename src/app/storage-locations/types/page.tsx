import { redirect } from "next/navigation";
import { optionListHref } from "@/lib/optionCategories";

// Location types are a Settings list.
export default function LocationTypesPage() {
  redirect(optionListHref("location_type"));
}
