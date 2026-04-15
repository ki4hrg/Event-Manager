import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export default async function SettingsContactsPage() {
  const contactRoles = await getOptions("contact_role");

  const createContactRole = async (formData: FormData) => {
    "use server";
    await createOption("contact_role", formData);
  };
  const reorderContactRoles = async (ids: string[]) => {
    "use server";
    await reorderOptions("contact_role", ids);
  };

  return (
    <div className="space-y-8">
      <OptionList
        title="Contact Roles"
        description="Roles that can be assigned to contacts (e.g., Speaker, Vendor, Staff)"
        category="contact_role"
        options={contactRoles}
        showColor={false}
        createOption={createContactRole}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderContactRoles}
      />
    </div>
  );
}
