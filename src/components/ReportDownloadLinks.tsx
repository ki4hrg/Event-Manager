import { btnOutlinedXs } from "@/lib/buttonStyles";
// .docx / .xlsx download links for the APEX reports (ESG, Post-Event Report).
// Authenticated report pages only — share views offer Print / Save PDF.
export function ReportDownloadLinks({ eventId, doc, query }: { eventId: string; doc: "esg" | "per"; query: string }) {
  const href = (format: "docx" | "xlsx") => `/api/events/${eventId}/esg?doc=${doc}&format=${format}${query ? `&${query}` : ""}`;
  const cls =
    btnOutlinedXs;
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
