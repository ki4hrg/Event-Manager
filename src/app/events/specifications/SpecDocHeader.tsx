import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ReportDownloadLinks } from "@/components/ReportDownloadLinks";

// One page per APEX document: the entry cards (/specifications, /post-event)
// and the rendered report (/reports/esg, /reports/post-event) share this
// header, so the downloads and the tab strip read the same on both halves.

export type SpecDoc = "esg" | "per";

const DOCS: Record<SpecDoc, { title: string; edit: string; preview: string }> = {
  esg: { title: "Event Specifications", edit: "specifications", preview: "reports/esg" },
  per: { title: "Post-Event Report", edit: "post-event", preview: "reports/post-event" },
};

export function specDocTitle(doc: SpecDoc) {
  return DOCS[doc].title;
}

export function SpecDocHeader({
  eventId,
  eventName,
  doc,
  active,
  query = "",
}: {
  eventId: string;
  eventName: string;
  doc: SpecDoc;
  active: "edit" | "preview";
  // The report's current filters, carried into the downloads and print link.
  query?: string;
}) {
  const { title, edit, preview } = DOCS[doc];
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        on
          ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: eventName, href: `/events/${eventId}` },
          { label: title },
        ]}
        title={title}
        actions={<ReportDownloadLinks eventId={eventId} doc={doc} query={query} />}
      />
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <nav className="-mb-px flex gap-6 overflow-x-auto whitespace-nowrap">
          {tab(`/events/${eventId}/${edit}`, "Edit", active === "edit")}
          {tab(`/events/${eventId}/${preview}`, "Preview", active === "preview")}
        </nav>
      </div>
    </>
  );
}
