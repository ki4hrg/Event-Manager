import type { CustomOption } from "@prisma/client";

type ResponsiblePartyFieldProps = {
  options: CustomOption[];
  defaultValue?: string;
};

export function ResponsiblePartyField({ options, defaultValue }: ResponsiblePartyFieldProps) {
  if (options.length > 0) {
    return (
      <select
        name="responsibleParty"
        required
        defaultValue={defaultValue || ""}
        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
      >
        <option value="">— Select —</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      name="responsibleParty"
      required
      defaultValue={defaultValue || ""}
      placeholder="e.g., Venue, Caterer, Event"
      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    />
  );
}
