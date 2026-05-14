export function SectionDivider({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="flex items-center gap-3 pt-2 print:break-after-avoid scroll-mt-24">
      <h2 className="text-base font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 print:text-gray-700 whitespace-nowrap">
        {title}
      </h2>
      <div className="flex-1 border-t-2 border-gray-400 dark:border-gray-500 print:border-gray-400"></div>
      <a
        href="#top"
        className="print:hidden text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
      >
        ↑ Top
      </a>
    </div>
  );
}
