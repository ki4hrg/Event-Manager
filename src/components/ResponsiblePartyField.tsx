import type { ResponsiblePartyOptions } from "@/app/vendors/actions";

type ResponsiblePartyFieldProps = {
  options: ResponsiblePartyOptions;
  defaultValue?: string | null;
  name?: string;
};

export function ResponsiblePartyField({ options, defaultValue, name = "responsiblePartyVendorId" }: ResponsiblePartyFieldProps) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    >
      <option value="">— None —</option>
      {options.systemVendor && (
        <option value={options.systemVendor.id}>{options.systemVendor.name}</option>
      )}
      {options.venueVendor && (
        <optgroup label="Venue">
          <option value={options.venueVendor.id}>{options.venueVendor.name}</option>
        </optgroup>
      )}
      {options.vendors.length > 0 && (
        <optgroup label="Vendors">
          {options.vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
