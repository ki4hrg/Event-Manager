import { PageWrapper } from "@/components/PageWrapper";
import { getAllOptions, createOption, updateOption, deleteOption, reorderOptions } from "./actions";
import { OptionList } from "./OptionList";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
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

  const reorderFunctionTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("function_type", ids);
  };
  const reorderContactRoles = async (ids: string[]) => {
    "use server";
    await reorderOptions("contact_role", ids);
  };
  const reorderAvEquipment = async (ids: string[]) => {
    "use server";
    await reorderOptions("av_equipment", ids);
  };
  const reorderScheduleTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("schedule_type", ids);
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

  const createServiceStyle = async (formData: FormData) => {
    "use server";
    await createOption("service_style", formData);
  };

  const reorderServiceStyles = async (ids: string[]) => {
    "use server";
    await reorderOptions("service_style", ids);
  };

  const createCateringProvider = async (formData: FormData) => {
    "use server";
    await createOption("catering_provider", formData);
  };

  const reorderCateringProviders = async (ids: string[]) => {
    "use server";
    await reorderOptions("catering_provider", ids);
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
          reorderOptions={reorderFunctionTypes}
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
          reorderOptions={reorderContactRoles}
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
          reorderOptions={reorderAvEquipment}
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
          reorderOptions={reorderScheduleTypes}
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
          reorderOptions={reorderPresenterRoles}
        />

        <OptionList
          title="Presentation Types"
          description="Types of presentations (e.g., Breakout, Plenary)"
          category="presentation_type"
          options={options.presentation_type}
          showColor={true}
          createOption={createPresentationType}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
          reorderOptions={reorderPresentationTypes}
        />

        <OptionList
          title="Service Styles"
          description="Catering service styles for BEOs (e.g., Plated, Buffet, Stations)"
          category="service_style"
          options={options.service_style}
          showColor={false}
          createOption={createServiceStyle}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
          reorderOptions={reorderServiceStyles}
        />

        <OptionList
          title="Catering Providers"
          description="Parties responsible for menu sections in BEOs (e.g., Venue, Caterer, Event Team)"
          category="catering_provider"
          options={options.catering_provider}
          showColor={false}
          createOption={createCateringProvider}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
          reorderOptions={reorderCateringProviders}
        />
      </div>
    </PageWrapper>
  );
}
