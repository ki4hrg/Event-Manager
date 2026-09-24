import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="text-sm text-gray-500 dark:text-gray-400 mb-1" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 flex-wrap">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1 min-w-0 break-words">
            {i > 0 && (
              <svg className="w-3 h-3 text-gray-400 dark:text-gray-600 shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {item.href ? (
              <Link href={item.href} className="hover:underline hover:text-gray-700 dark:hover:text-gray-300">
                {item.label}
              </Link>
            ) : (
              <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
