import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

export type MenuItem = { label: string; href: string; download?: boolean };

const itemClass = "block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 whitespace-nowrap";

// A button that opens a short list of links (details/summary, no script):
// New RFP's kinds, an RFP's downloads.
export function MenuButton({ label, items, primary = false }: { label: string; items: MenuItem[]; primary?: boolean }) {
  return (
    <details className="relative">
      <summary className={`${primary ? btnPrimary : btnSecondary} inline-block cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden`}>
        {label} <span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute left-0 sm:left-auto sm:right-0 z-20 mt-1 min-w-44 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg">
        {items.map((i) =>
          i.download ? (
            <a key={i.href} href={i.href} download className={itemClass}>
              {i.label}
            </a>
          ) : (
            <Link key={i.href} href={i.href} className={itemClass}>
              {i.label}
            </Link>
          ),
        )}
      </div>
    </details>
  );
}
