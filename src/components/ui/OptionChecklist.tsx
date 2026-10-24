// Checkboxes over an option list's labels, posted as repeated `name` values.
// Checked labels no longer on the list stay as boxes of their own, so saving
// doesn't drop them.
export function OptionChecklist({ name, options, checked }: { name: string; options: readonly string[]; checked: readonly string[] }) {
  const labels = [...options, ...checked.filter((c) => !options.includes(c))];
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {labels.map((label) => (
        <label key={label} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" name={name} value={label} defaultChecked={checked.includes(label)} className="rounded border-gray-300 dark:border-gray-600" />
          {label}
        </label>
      ))}
    </div>
  );
}
