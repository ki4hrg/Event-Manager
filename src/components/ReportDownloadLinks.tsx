// .docx / .xlsx download links for the APEX reports (ESG, Post-Event Report).
// Authenticated report pages only — share views offer Print / Save PDF.
export function ReportDownloadLinks({ eventId, doc, query }: { eventId: string; doc: "esg" | "per"; query: string }) {
  const href = (format: "docx" | "xlsx") => `/api/events/${eventId}/esg?doc=${doc}&format=${format}${query ? `&${query}` : ""}`;
  const cls =
    "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300";
  return (
    <>
      <a href={href("docx")} className={cls} download>
        Word
      </a>
      <a href={href("xlsx")} className={cls} download>
        Excel
      </a>
    </>
  );
}
