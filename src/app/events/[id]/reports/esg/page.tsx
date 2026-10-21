import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "../../../actions";
import { getEsgData } from "@/app/events/reports/actions";
import { listShareLinkGroupChoicesForEvent } from "@/app/events/share-link-groups/actions";
import { ShareReportButton } from "@/components/ShareReportButton";
import { AddToDashboardBanner } from "@/components/AddToDashboardBanner";
import { ReportPaper } from "@/components/ReportPaper";
import { esgFiltersToQuery, parseEsgSearchParams, type EsgSearchParams } from "@/lib/esg/params";
import { AVAILABLE_ESG_PARTS } from "@/lib/esg/types";
import { ReportFilters } from "./ReportFilters";
import { EsgReport } from "./EsgReport";
import { SpecDocHeader } from "../../../specifications/SpecDocHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event Specifications" };

export default async function EsgReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<EsgSearchParams & { addToDashboard?: string }>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  const addToDashboard = typeof sp.addToDashboard === "string" ? sp.addToDashboard : undefined;
  const filters = parseEsgSearchParams(sp);

  const [event, data, dashboardChoices] = await Promise.all([
    getEvent(eventId),
    getEsgData(eventId, filters),
    listShareLinkGroupChoicesForEvent(eventId),
  ]);
  if (!event || !data) notFound();
  const { applied } = data;

  return (
    <>
      <SpecDocHeader eventId={eventId} eventName={event.name} doc="esg" active="preview" query={esgFiltersToQuery(applied)} />

      <div className="max-w-5xl mx-auto">
        <AddToDashboardBanner eventId={eventId} addToDashboardId={addToDashboard} dashboardChoices={dashboardChoices} />
        <ReportFilters
          eventId={eventId}
          timezone={event.timezone}
          availableParts={AVAILABLE_ESG_PARTS}
          selectedParts={applied.parts.filter((p) => AVAILABLE_ESG_PARTS.includes(p))}
          days={data.dayOptions}
          selectedDays={applied.days}
          functions={data.functionOptions}
          selectedFunctionIds={applied.functionIds}
          showBlank={applied.showBlank}
          includeBilling={applied.includeBilling}
          hidePrint
          shareButton={
            <ShareReportButton
              eventId={eventId}
              reportType="ESG"
              currentFilters={{
                parts: applied.parts,
                days: applied.days,
                functionIds: applied.functionIds,
                showBlank: applied.showBlank,
                // Billing (tax ID, bill-to, signatories) stays off share links
                // unless the sharer explicitly includes it.
                includeBilling: false,
              }}
              dashboardChoices={dashboardChoices}
              addToDashboardId={addToDashboard}
            />
          }
        />
        <ReportPaper title="Event Specifications Guide">
          <EsgReport doc={data.document} />
        </ReportPaper>
      </div>
    </>
  );
}
