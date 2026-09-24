import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendor options" };

export default async function SettingsVendorsPage() {
  const vendorContactTypes = await getOptions("vendor_contact_type");

  const createVendorContactType = async (formData: FormData) => {
    "use server";
    await createOption("vendor_contact_type", formData);
  };
  const reorderVendorContactTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("vendor_contact_type", ids);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      <OptionList
        title="Vendor Contact Types"
        description="Roles for vendor contacts (e.g., Sales, Billing, Technical)"
        category="vendor_contact_type"
        options={vendorContactTypes}
        showColor={false}
        createOption={createVendorContactType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderVendorContactTypes}
      />
    </div>
  );
}
