// Shared Tailwind class strings for print/report pages.
// Import these instead of declaring them locally so dark mode and print
// styles stay consistent across all reports.

export const reportTh =
  "px-3 py-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 print:text-black border-b border-gray-300 dark:border-gray-600 print:border-gray-400 bg-gray-100 dark:bg-gray-700 print:bg-gray-200 whitespace-nowrap";

// reportTh variant that allows wrapping — use for column headers (e.g. room names)
// where titles are too long to fit on one line at narrow widths.
export const reportThWrap = reportTh.replace(
  "whitespace-nowrap",
  "whitespace-normal break-words"
);

export const reportTd =
  "px-3 py-2 text-xs text-gray-700 dark:text-gray-300 print:text-gray-900 border-b border-gray-200 dark:border-gray-700 print:border-gray-300 align-top";

// Colored separator row used to group table sections by party/vendor/etc.
export const reportGroupRow =
  "px-3 py-2 text-xs font-semibold text-gray-900 dark:text-gray-100 print:text-black bg-gray-50 dark:bg-gray-700 print:bg-gray-100 border-b border-gray-300 dark:border-gray-600 print:border-gray-400";

// Top-level section card (white card with shadow on screen, plain on print).
export const reportSectionCard =
  "bg-white dark:bg-gray-800 shadow rounded-lg p-6 print:shadow-none print:rounded-none print:border-t print:border-gray-300 print:px-0 print:py-4";

// reportSectionCard with tighter padding on phones (the APEX documents).
export const reportSectionCardCompact = reportSectionCard.replace("p-6", "px-3 py-4 sm:p-6");

// Card wrapping an individual order within a section.
export const reportOrderCard =
  "print:break-inside-avoid border border-gray-200 dark:border-gray-700 print:border-0 print:border-b print:border-gray-200 rounded-lg p-4 print:px-0 print:rounded-none mb-4";

// Small muted text used in footers and metadata lines.
export const reportFooterText =
  "text-xs text-gray-500 dark:text-gray-400 print:text-gray-600";

// Small uppercase label ("Report:", column kickers) above or beside a value.
export const labelMicroCaps =
  "text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400";
