"use client";

export function PrintButton({ backHref }: { backHref?: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
      >
        Print / Save as PDF
      </button>
      {backHref && (
        <a
          href={backHref}
          className="px-4 py-2 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          ← Back
        </a>
      )}
    </div>
  );
}
