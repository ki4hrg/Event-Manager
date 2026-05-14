export function SectionDivider({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="flex items-center gap-3 pt-2 print:break-after-avoid scroll-mt-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 print:text-gray-700 whitespace-nowrap">
        {title}
      </h2>
      <div className="flex-1 border-t border-gray-300 dark:border-gray-600 print:border-gray-400"></div>
    </div>
  );
}
