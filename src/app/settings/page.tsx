import { redirect } from "next/navigation";
import { OPTION_SECTIONS } from "@/lib/optionCategories";

export default function SettingsPage() {
  redirect(OPTION_SECTIONS["event-planning"].href);
}
