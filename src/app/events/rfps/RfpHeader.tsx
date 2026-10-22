import Link from "next/link";
import type { RfpKind, RfpStatus } from "@prisma/client";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { PageHeader } from "@/components/PageHeader";
import { btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { RFP_KIND_LABELS, resourceForKind, responseNoun, rfpHref, rfpListHref } from "@/lib/rfp/kinds";
import { RFP_STATUS_COLORS, RFP_STATUS_LABELS } from "@/lib/rfp/sections";
import { IssueRfpButton } from "./IssueRfpButton";
import { MenuButton } from "./MenuButton";

// An RFP page's header, hotel or vendor: Compare (once there are responses),
// Download, Issue (until it's closed), Delete.
export function RfpHeader({
  event,
  rfp,
  responses,
  issue,
  remove,
}: {
  event: { id: string; name: string; timezone: string };
  rfp: {
    id: string;
    kind: RfpKind;
    title: string;
    status: RfpStatus;
    service: string | null;
    issuedOn: Date | null;
    updatedAt: Date;
    updatedBy: { name: string | null; email: string } | null;
  };
  responses: number;
  issue: () => Promise<void>;
  remove: () => Promise<void>;
}) {
  const base = rfpHref(event.id, rfp.kind, rfp.id);
  const resource = resourceForKind(rfp.kind);
  const kindLabel = rfp.kind === "OTHER" ? (rfp.service ?? RFP_KIND_LABELS.OTHER) : RFP_KIND_LABELS[rfp.kind];
  return (
    <PageHeader
      breadcrumbs={[
        { label: "Events", href: "/events" },
        { label: event.name, href: `/events/${event.id}` },
        { label: "RFPs", href: rfpListHref(event.id) },
        { label: rfp.title },
      ]}
      title={rfp.title}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[RFP_STATUS_COLORS[rfp.status]]}`}>{RFP_STATUS_LABELS[rfp.status]}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{kindLabel}</span>
          <LastUpdated updatedAt={rfp.updatedAt} updatedBy={rfp.updatedBy} timezone={event.timezone} />
        </div>
      }
      actions={
        <>
          {responses > 0 && (
            <Link href={`${base}/compare`} className={btnSecondary}>
              Compare {responseNoun(rfp.kind)}s
            </Link>
          )}
          <MenuButton
            label="Download"
            items={[
              { label: "Print / Save PDF", href: `${base}/print` },
              { label: "Word (.docx)", href: `/api/events/${event.id}/rfps/${rfp.id}?format=docx`, download: true },
            ]}
          />
          {rfp.status !== "CLOSED" && <IssueRfpButton action={issue} resource={resource} reissue={rfp.issuedOn != null} />}
          <DeleteButton action={remove} resource={resource} label="Delete RFP" />
        </>
      }
    />
  );
}
