import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

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
    <div className="space-y-8">
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
