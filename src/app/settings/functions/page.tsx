import type { Metadata } from "next";
import { getOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Function options" };

export default async function SettingsFunctionsPage() {
  const [functionTypes, scheduleTypes, setupTypes] = await Promise.all([
    getOptions("function_type"),
    getOptions("schedule_type"),
    getOptions("setup_type"),
  ]);

  const createFunctionType = async (formData: FormData) => {
    "use server";
    await createOption("function_type", formData);
  };
  const reorderFunctionTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("function_type", ids);
  };

  const createScheduleType = async (formData: FormData) => {
    "use server";
    await createOption("schedule_type", formData);
  };
  const reorderScheduleTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("schedule_type", ids);
  };

  const createSetupType = async (formData: FormData) => {
    "use server";
    await createOption("setup_type", formData);
  };
  const reorderSetupTypes = async (ids: string[]) => {
    "use server";
    await reorderOptions("setup_type", ids);
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <OptionList
        title="Function Types"
        description="Categories for scheduled functions (e.g., Meal, Breakout, Plenary)"
        category="function_type"
        options={functionTypes}
        showColor={true}
        createOption={createFunctionType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderFunctionTypes}
      />
      <OptionList
        title="Schedule Types"
        description="Types of schedule items for functions (e.g., Setup, Rehearsal, Main Event)"
        category="schedule_type"
        options={scheduleTypes}
        showColor={true}
        createOption={createScheduleType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderScheduleTypes}
      />
      <OptionList
        title="Setup Types"
        description="Room setup configurations for Setup Orders (e.g., Theater, Classroom, Banquet Rounds)"
        category="setup_type"
        options={setupTypes}
        showColor={false}
        createOption={createSetupType}
        updateOption={updateOption}
        deleteOption={deleteOption}
        reorderOptions={reorderSetupTypes}
      />
    </div>
  );
}
