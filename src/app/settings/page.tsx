import { PageWrapper } from "@/components/PageWrapper";
import { getAllOptions, createOption, updateOption, deleteOption } from "./actions";
import { OptionList } from "./OptionList";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const options = await getAllOptions();

  const createFunctionType = async (formData: FormData) => {
    "use server";
    await createOption("function_type", formData);
  };

  const createContactRole = async (formData: FormData) => {
    "use server";
    await createOption("contact_role", formData);
  };

  const createAvEquipment = async (formData: FormData) => {
    "use server";
    await createOption("av_equipment", formData);
  };

  const updateOptionAction = async (id: string, formData: FormData) => {
    "use server";
    await updateOption(id, formData);
  };

  const deleteOptionAction = async (id: string) => {
    "use server";
    await deleteOption(id);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure dropdown options and system preferences
        </p>
      </div>

      <div className="space-y-8">
        <OptionList
          title="Function Types"
          description="Categories for scheduled functions (e.g., Meal, Breakout, Plenary)"
          category="function_type"
          options={options.function_type}
          showColor={true}
          createOption={createFunctionType}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />

        <OptionList
          title="Contact Roles"
          description="Roles that can be assigned to contacts (e.g., Speaker, Vendor, Staff)"
          category="contact_role"
          options={options.contact_role}
          showColor={false}
          createOption={createContactRole}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />

        <OptionList
          title="AV Equipment"
          description="Audio/visual equipment options for functions"
          category="av_equipment"
          options={options.av_equipment}
          showColor={false}
          createOption={createAvEquipment}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />
      </div>
    </PageWrapper>
  );
}
