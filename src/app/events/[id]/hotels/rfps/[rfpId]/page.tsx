import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { LastUpdated } from "@/components/LastUpdated";
import { Toast } from "@/components/Toast";
import { getOptions } from "@/app/settings/actions";
import { btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { dateKey } from "@/lib/hotels";
import { RFP_STATUS_COLORS, RFP_STATUS_LABELS } from "@/lib/rfp/sections";
import { getEvent } from "../../../../actions";
import type { RfpBlockArgs, RfpConcessionArgs } from "../../../../rfps/core";
import type { PatternBasis } from "@/lib/hotelPattern";
import type { HotelBlockType } from "@prisma/client";
import {
  deleteRfp,
  getRfp,
  getRfpFormChoices,
  getRfpPatternFill,
  issueRfp,
  saveRfpBlocks,
  saveRfpConcessions,
  updateRfp,
} from "../../../../rfps/actions";
import { IssueRfpButton } from "../../../../rfps/IssueRfpButton";
import { RfpBlocksEditor } from "../../../../rfps/RfpBlocksEditor";
import { RfpConcessionsEditor } from "../../../../rfps/RfpConcessionsEditor";
import { RfpForm } from "../../../../rfps/RfpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RFP" };

export default async function RfpPage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const [event, rfp, choices, fileTypeOptions] = await Promise.all([
    getEvent(eventId),
    getRfp(rfpId, eventId),
    getRfpFormChoices(eventId, "HOTEL"),
    getOptions("file_type"),
  ]);
  if (!event || !rfp || rfp.kind !== "HOTEL") notFound();

  const base = `/events/${eventId}/hotels/rfps/${rfpId}`;
  const updateAction = async (formData: FormData) => {
    "use server";
    await updateRfp(rfpId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteRfp(rfpId, eventId);
  };
  const issueAction = async () => {
    "use server";
    await issueRfp(rfpId, eventId);
  };
  const saveBlocksAction = async (blocks: RfpBlockArgs[]) => {
    "use server";
    await saveRfpBlocks(rfpId, eventId, blocks);
  };
  const saveConcessionsAction = async (concessions: RfpConcessionArgs[]) => {
    "use server";
    await saveRfpConcessions(rfpId, eventId, concessions);
  };
  const fillAction = async (args: { seriesId: string | null; blockType: HotelBlockType | null; basis: PatternBasis; adjust: number }) => {
    "use server";
    return getRfpPatternFill(eventId, args);
  };
  const contactName = rfp.contact ? `${rfp.contact.firstName} ${rfp.contact.lastName}`.trim() : null;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Hotels", href: `/events/${eventId}/hotels` },
              { label: rfp.title },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">
            {rfp.title}
            <span className={`ml-2 align-middle px-2 py-0.5 rounded text-xs font-medium ${colorClasses[RFP_STATUS_COLORS[rfp.status]]}`}>
              {RFP_STATUS_LABELS[rfp.status]}
            </span>
          </h1>
          <LastUpdated updatedAt={rfp.updatedAt} updatedBy={rfp.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <Link href={`${base}/print`} className={btnSecondary}>
            Print / Save PDF
          </Link>
          <a href={`/api/events/${eventId}/rfps/${rfpId}?format=docx`} className={btnSecondary}>
            Download .docx
          </a>
          <IssueRfpButton action={issueAction} resource="HOTELS" reissue={rfp.issuedOn != null} />
          <DeleteButton action={deleteAction} resource="HOTELS" label="Delete RFP" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 min-w-0 space-y-6">
          <RfpForm
            key={rfp.updatedAt.toISOString()}
            kind="HOTEL"
            resource="HOTELS"
            values={{
              title: rfp.title,
              status: rfp.status,
              responseDue: rfp.responseDue ? dateKey(rfp.responseDue) : null,
              decisionBy: rfp.decisionBy ? dateKey(rfp.decisionBy) : null,
              sections: rfp.sections,
              introduction: rfp.introduction,
              requirements: rfp.requirements,
              contactId: rfp.contactId,
              contactName,
              showRoomNames: rfp.showRoomNames,
              excludedFunctionTypes: rfp.excludedFunctionTypes,
            }}
            choices={choices}
            action={updateAction}
          />
          {rfp.sections.includes("blocks") && (
            <RfpBlocksEditor
              key={`blocks-${rfp.updatedAt.toISOString()}`}
              blocks={rfp.hotelBlocks.map((b) => ({
                blockType: b.blockType,
                isRunOfHouse: b.isRunOfHouse,
                targetRate: b.targetRate?.toString() ?? null,
                notes: b.notes,
                nights: b.nights.map((n) => ({ roomType: n.roomType, night: dateKey(n.night), rooms: n.rooms })),
              }))}
              eventStart={dateKey(event.startDate)}
              eventEnd={dateKey(event.endDate)}
              roomTypes={choices.roomTypes}
              series={choices.series}
              defaultSeriesId={event.seriesId ?? null}
              save={saveBlocksAction}
              fill={fillAction}
            />
          )}
          {rfp.sections.includes("concessions") && (
            <RfpConcessionsEditor
              key={`concessions-${rfp.updatedAt.toISOString()}`}
              resource="HOTELS"
              concessions={rfp.concessions.map((c) => ({ label: c.label, value: c.value, required: c.required }))}
              options={choices.concessions}
              save={saveConcessionsAction}
            />
          )}
        </div>
        <div className="space-y-6 min-w-0">
          <FileUploadPanel entityType="rfp" entityId={rfpId} files={rfp.files} fileTypeOptions={fileTypeOptions} revalidateTarget={base} />
        </div>
      </div>
    </>
  );
}
