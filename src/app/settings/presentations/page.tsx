import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Presentation options" };

export default async function SettingsPresentationsPage() {
  const [presenterRoles, presentationTypes] = await Promise.all([
    getOptions("presenter_role"),
    getOptions("presentation_type"),
  ]);

  const createPresenterRole = async (formData: FormData) => {
    "use server";
    await createOption("presenter_role", formData);
  };
  const reorderPresenterRoles = async (ids: string[]) => {
    "use server";
    await reorderOptions("presenter_role", ids);
  };

  const createPresentationType = async (formData: FormData) => {
    "use server";
    await createOption("presentation_type", formData);
  };
  const reorderPresentationTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("presentation_type", ids);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      <OptionList
        title="Presenter Roles"
        description="Roles for speakers in presentations (e.g., Presenter, Co-Presenter, Moderator)"
        category="presenter_role"
        options={presenterRoles}
        showColor={false}
        createOption={createPresenterRole}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderPresenterRoles}
      />
      <OptionList
        title="Presentation Types"
        description="Types of presentations (e.g., Breakout, Plenary)"
        category="presentation_type"
        options={presentationTypes}
        showColor={true}
        createOption={createPresentationType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderPresentationTypes}
      />
    </div>
  );
}
