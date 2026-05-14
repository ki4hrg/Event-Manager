type ReportNavLink = { id: string; label: string };

export function ReportNav({ links }: { links: ReportNavLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav className="print:hidden text-xs flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 px-4 sm:px-6 bg-white dark:bg-gray-800 shadow rounded-lg">
      <span className="font-medium uppercase tracking-wide text-gray-500 dark:text-gray-500">Jump to:</span>
      {links.map((link) => (
        <a key={link.id} href={`#${link.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
          {link.label}
        </a>
      ))}
    </nav>
  );
}
