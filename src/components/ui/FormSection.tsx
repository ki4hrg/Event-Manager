/**
 * A titled group of fields inside a longer inline form, so an item form reads
 * as a few labeled blocks instead of one undifferentiated grid. Sections after
 * the first get a top rule; the body is the same 1→2 column grid the item forms
 * already use, so `md:col-span-2` on a child still means "full width".
 */
export function FormSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-t border-gray-200 dark:border-gray-700 pt-3 first:border-t-0 first:pt-0">
      {title && (
        <legend className="float-left w-full mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </legend>
      )}
      <div className="clear-left grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}
