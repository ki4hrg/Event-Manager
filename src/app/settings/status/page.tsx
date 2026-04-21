import { getSubstatusOptions, createOption, updateOption, deleteOption, reorderOptions } from "../actions";
import { OptionList } from "../OptionList";

export const dynamic = "force-dynamic";

const GROUPS = [
  { group: "PENDING", label: "Pending Substatuses", description: "Specific states within the Pending top-level status (e.g., Expected, Requested)" },
  { group: "IN_PROGRESS", label: "In Progress Substatuses", description: "Specific states within the In Progress top-level status (e.g., Approved)" },
  { group: "COMPLETE", label: "Complete Substatuses", description: "Specific states within the Complete top-level status (e.g., Confirmed)" },
  { group: "CANCELLED", label: "Cancelled Substatuses", description: "Specific states used when cancelling an entity (e.g., Denied, Cancelled)" },
] as const;

export default async function SettingsStatusPage() {
  const [pending, inProgress, complete, cancelled] = await Promise.all(
    GROUPS.map(({ group }) => getSubstatusOptions(group))
  );

  const optionsByGroup = { PENDING: pending, IN_PROGRESS: inProgress, COMPLETE: complete, CANCELLED: cancelled };

  return (
    <div className="space-y-8">
      {GROUPS.map(({ group, label, description }) => {
        const createSubstatus = async (formData: FormData) => {
          "use server";
          formData.set("group", group);
          await createOption("substatus", formData);
        };
        const reorderSubstatuses = async (ids: string[]) => {
          "use server";
          await reorderOptions("substatus", ids);
        };
        return (
          <OptionList
            key={group}
            title={label}
            description={description}
            category="substatus"
            options={optionsByGroup[group]}
            showColor={false}
            createOption={createSubstatus}
            updateOption={updateOption}
            deleteOption={deleteOption}
            reorderOptions={reorderSubstatuses}
          />
        );
      })}
    </div>
  );
}
