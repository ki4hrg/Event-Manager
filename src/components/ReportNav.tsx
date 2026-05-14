type ReportNavLink = { id: string; label: string };

type ReportNavProps = {
  links?: ReportNavLink[];
  sections?: ReportNavLink[];
  items?: ReportNavLink[];
  itemsLabel?: string;
};

export function ReportNav({ links, sections, items, itemsLabel = "Functions & Presentations" }: ReportNavProps) {
  const sectionLinks = sections ?? links ?? [];
  const itemLinks = items ?? [];
  if (sectionLinks.length === 0 && itemLinks.length === 0) return null;

  return (
    <nav
      id="top"
      className="print:hidden sticky top-2 z-10 text-xs py-3 px-4 sm:px-6 bg-white dark:bg-gray-800 shadow-md rounded-lg"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium uppercase tracking-wide text-gray-500 dark:text-gray-500">Jump to:</span>
        {sectionLinks.map((link) => (
          <a key={link.id} href={`#${link.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
            {link.label}
          </a>
        ))}
        {itemLinks.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 marker:hidden">
              {itemsLabel} ({itemLinks.length}) <span className="inline-block transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-baseline gap-x-3 gap-y-1 max-h-40 overflow-y-auto">
              {itemLinks.map((link) => (
                <a key={link.id} href={`#${link.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {link.label}
                </a>
              ))}
            </div>
          </details>
        )}
      </div>
    </nav>
  );
}
