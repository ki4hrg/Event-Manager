import { PageWrapper } from "@/components/PageWrapper";
import { getAllOptions, createOption, updateOption, deleteOption, reorderOptions, getEquipment, createEquipment, updateEquipment, deleteEquipment } from "./actions";
import { OptionList } from "./OptionList";
import { EquipmentList } from "./EquipmentList";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const [options, equipment] = await Promise.all([getAllOptions(), getEquipment()]);

  const createFunctionType = async (formData: FormData) => {
    "use server";
    await createOption("function_type", formData);
  };

  const createContactRole = async (formData: FormData) => {
    "use server";
    await createOption("contact_role", formData);
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

  const createResponsibleParty = async (formData: FormData) => {
    "use server";
    await createOption("responsible_party", formData);
  };

  const reorderResponsibleParties = async (ids: string[]) => {
    "use server";
    await reorderOptions("responsible_party", ids);
  };

  const createEquipmentCategory = async (formData: FormData) => {
    "use server";
    await createOption("equipment_category", formData);
  };

  const reorderEquipmentCategories = async (ids: string[]) => {
    "use server";
    await reorderOptions("equipment_category", ids);
  };

  const createSetupType = async (formData: FormData) => {
    "use server";
    await createOption("setup_type", formData);
  };

  const reorderSetupTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("setup_type", ids);
  };

  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createEquipment(formData);
  };

  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateEquipment(id, formData);
  };

  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteEquipment(id);
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
          title="Responsible Parties"
          description="Parties responsible for equipment items in BEOs (e.g., Venue, Caterer, Event)"
          category="responsible_party"
          options={options.responsible_party}
          showColor={false}
          createOption={createResponsibleParty}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
          reorderOptions={reorderResponsibleParties}
        />

        <OptionList
          title="Equipment Categories"
          description="Categories for organizing equipment (e.g., AV, Tables, Chairs). Tables and Chairs are system categories and cannot be deleted."
          category="equipment_category"
          options={options.equipment_category}
          showColor={false}
          createOption={createEquipmentCategory}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
          reorderOptions={reorderEquipmentCategories}
        />

        <EquipmentList
          equipment={equipment}
          categories={options.equipment_category}
          createEquipment={createEquipmentAction}
          updateEquipment={updateEquipmentAction}
          deleteEquipment={deleteEquipmentAction}
        />

        <OptionList
          title="Setup Types"
          description="Room setup configurations for Setup Orders (e.g., Theater, Classroom, Banquet Rounds)"
          category="setup_type"
          options={options.setup_type}
          showColor={false}
          createOption={createSetupType}
          updateOption={updateOptionAction}
          deleteOption={deleteOptionAction}
          reorderOptions={reorderSetupTypes}
        />
      </div>
    </PageWrapper>
  );
}
