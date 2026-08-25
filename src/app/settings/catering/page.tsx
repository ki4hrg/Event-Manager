import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Catering options" };

export default async function SettingsCateringPage() {
  const serviceStyles = await getOptions("service_style");

  const createServiceStyle = async (formData: FormData) => {
    "use server";
    await createOption("service_style", formData);
  };
  const reorderServiceStyles = async (ids: string[]) => {
    "use server";
    await reorderOptions("service_style", ids);
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
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
    </div>
  );
}
