import { btnOutlinedXs } from "@/lib/buttonStyles";

// Word / Excel downloads and the print route for the APEX reports (ESG,
// Post-Event Report). Authenticated pages only — share views offer Print /
// Save PDF from their own shell.
export function ReportDownloadLinks({ eventId, doc, query }: { eventId: string; doc: "esg" | "per"; query: string }) {
  const href = (format: "docx" | "xlsx") => `/api/events/${eventId}/esg?doc=${doc}&format=${format}${query ? `&${query}` : ""}`;
  const print = `/events/${eventId}/reports/${doc === "esg" ? "esg" : "post-event"}/print${query ? `?${query}` : ""}`;
  return (
    <>
      <a href={href("docx")} className={btnOutlinedXs} download>
        Word
      </a>
      <a href={href("xlsx")} className={btnOutlinedXs} download>
        Excel
      </a>
      <a href={print} className={btnOutlinedXs}>
        Print / Save PDF
      </a>
    </>
  );
}
