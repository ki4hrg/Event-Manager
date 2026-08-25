import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "File options" };

export default async function SettingsFilesPage() {
  const fileTypes = await getOptions("file_type");

  const createFileType = async (formData: FormData) => {
    "use server";
    await createOption("file_type", formData);
  };
  const reorderFileTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("file_type", ids);
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <OptionList
        title="File Types"
        description="Categories for file attachments (e.g., Proposal, Invoice, Contract)"
        category="file_type"
        options={fileTypes}
        showColor={false}
        createOption={createFileType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderFileTypes}
      />
    </div>
  );
}
