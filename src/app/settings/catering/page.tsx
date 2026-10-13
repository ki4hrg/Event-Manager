import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";
import { MEAL_BUCKETS } from "@/lib/esg/apex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Catering options" };

export default async function SettingsCateringPage() {
  const [serviceStyles, mealTypes] = await Promise.all([getOptions("service_style"), getOptions("meal_type")]);

  const createServiceStyle = async (formData: FormData) => {
    "use server";
    await createOption("service_style", formData);
  };
  const reorderServiceStyles = async (ids: string[]) => {
    "use server";
    await reorderOptions("service_style", ids);
  };

  const createMealType = async (formData: FormData) => {
    "use server";
    await createOption("meal_type", formData);
  };
  const reorderMealTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("meal_type", ids);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      <OptionList
        title="Service Styles"
        description="Catering service styles for Catering Orders (e.g., Plated, Buffet, Stations)"
        category="service_style"
        options={serviceStyles}
        showColor={false}
        createOption={createServiceStyle}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderServiceStyles}
      />
      <OptionList
        title="Meal Types"
        description="Meal period for Catering Orders. The APEX bucket decides where an order counts in the ESG / Post-Event Report attendance grids."
        category="meal_type"
        options={mealTypes}
        showColor={false}
        groupOptions={[...MEAL_BUCKETS]}
        groupLabel="APEX bucket"
        createOption={createMealType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderMealTypes}
      />
    </div>
  );
}
