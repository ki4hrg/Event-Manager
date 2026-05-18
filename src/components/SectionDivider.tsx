"use client";

export function SectionDivider({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="flex items-center gap-3 pt-2 print:break-after-avoid scroll-mt-24">
      <h2
        title={title}
        className="text-base font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 print:text-gray-700 truncate min-w-0"
      >
        {title}
      </h2>
      <div className="flex-1 border-t-2 border-gray-400 dark:border-gray-500 print:border-gray-400"></div>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="print:hidden text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
      >
        ↑ Top
      </button>
    </div>
  );
}
