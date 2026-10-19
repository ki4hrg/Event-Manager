// `mobileId` targets the anchor inside a report's `sm:hidden` card variant when
// the entity's desktop anchor lives in a table row that is hidden on phones.
type ReportNavLink = { id: string; label: string; mobileId?: string };

const linkClass = "text-blue-600 dark:text-blue-400 hover:underline break-words min-w-0";

function NavLink({ link }: { link: ReportNavLink }) {
  if (!link.mobileId) {
    return (
      <a href={`#${link.id}`} className={linkClass}>
        {link.label}
      </a>
    );
  }
  return (
    <>
      <a href={`#${link.mobileId}`} className={`${linkClass} sm:hidden`}>
        {link.label}
      </a>
      <a href={`#${link.id}`} className={`${linkClass} hidden sm:inline`}>
        {link.label}
      </a>
    </>
  );
}

export type ReportNavItemGroup = {
  label: string;
  links: ReportNavLink[];
};

type ReportNavProps = {
  links?: ReportNavLink[];
  sections?: ReportNavLink[];
  items?: ReportNavLink[];
  itemsLabel?: string;
  itemGroups?: ReportNavItemGroup[];
};

export function ReportNav({ links, sections, items, itemsLabel = "Functions & Presentations", itemGroups }: ReportNavProps) {
  const sectionLinks = sections ?? links ?? [];
  const groups: ReportNavItemGroup[] =
    itemGroups ?? (items && items.length > 0 ? [{ label: itemsLabel, links: items }] : []);
  const hasItems = groups.some((g) => g.links.length > 0);
  if (sectionLinks.length === 0 && !hasItems) return null;

  return (
    <>
      <div id="top" aria-hidden className="print:hidden" />
      <nav
        className="print:hidden sticky top-2 z-10 text-xs py-3 px-4 sm:px-6 bg-white dark:bg-gray-800 shadow-md rounded-lg"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium uppercase tracking-wide text-gray-500 dark:text-gray-500">Jump to:</span>
          {sectionLinks.map((link) => (
            <NavLink key={link.id} link={link} />
          ))}
          {groups.map((group) =>
            group.links.length === 0 ? null : (
              <details key={group.label} className="group">
                <summary className="cursor-pointer list-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 marker:hidden">
                  {group.label} ({group.links.length}) <span className="inline-block transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-baseline gap-x-3 gap-y-1 max-h-40 overflow-y-auto">
                  {group.links.map((link) => (
                    <NavLink key={link.id} link={link} />
                  ))}
                </div>
              </details>
            )
          )}
        </div>
      </nav>
    </>
  );
}
