type ResponsiblePartyFieldProps = {
  vendors: { id: string; name: string }[];
  defaultValue?: string | null;
};

export function ResponsiblePartyField({ vendors, defaultValue }: ResponsiblePartyFieldProps) {
  return (
    <select
      name="responsiblePartyVendorId"
      defaultValue={defaultValue || ""}
      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    >
      <option value="">— None —</option>
      {vendors.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}
