import Link from "next/link";

// Edit (the cards) or Preview (the document as hotels and vendors get it),
// in ?view= so a reload keeps the tab.
export function RfpTabs({ base, preview }: { base: string; preview: boolean }) {
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <nav className="-mb-px flex gap-6 overflow-x-auto whitespace-nowrap">
        {tab(base, "Edit", !preview)}
        {tab(`${base}?view=preview`, "Preview", preview)}
      </nav>
    </div>
  );
}
