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

  const createScheduleType = async (formData: FormData) => {
    "use server";
    await createOption("schedule_type", formData);
  };

  const createPresentationTrack = async (formData: FormData) => {
    "use server";
    await createOption("presentation_track", formData);
  };

  const createPresentationLevel = async (formData: FormData) => {
    "use server";
    await createOption("presentation_level", formData);
  };

  const createPresenterRole = async (formData: FormData) => {
    "use server";
    await createOption("presenter_role", formData);
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

        <OptionList
          title="Schedule Types"
          description="Types of schedule items for functions (e.g., Setup, Rehearsal, Main Event)"
          category="schedule_type"
          options={options.schedule_type}
          showColor={true}
          createOption={createScheduleType}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />

        <OptionList
          title="Presentation Tracks"
          description="Categories for breakout presentations (e.g., Technology, Leadership, Operations)"
          category="presentation_track"
          options={options.presentation_track}
          showColor={true}
          createOption={createPresentationTrack}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />

        <OptionList
          title="Presentation Levels"
          description="Difficulty levels for presentations (e.g., Beginner, Intermediate, Advanced)"
          category="presentation_level"
          options={options.presentation_level}
          showColor={true}
          createOption={createPresentationLevel}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />

        <OptionList
          title="Presenter Roles"
          description="Roles for speakers in presentations (e.g., Presenter, Co-Presenter, Moderator)"
          category="presenter_role"
          options={options.presenter_role}
          showColor={false}
          createOption={createPresenterRole}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
        />
      </div>
    </PageWrapper>
  );
}
