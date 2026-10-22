import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "@/app/events/event";
import {
  getMediaDeliverables,
  deleteMediaDeliverable,
  deleteMediaDeliverables,
  bulkUpdateMediaDeliverables,
} from "../../media-deliverables/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { getSubstatusOptions, getOptions } from "@/app/settings/actions";
import { getHiddenColumns } from "@/app/events/table-columns-actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getFunctionOptions } from "../../functions/actions";
import { getPresentationOptions } from "../../presentations/actions";
import { MediaDeliverableList } from "../../media-deliverables/MediaDeliverableList";
import type { EntityStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Media deliverables" };

export default async function MediaDeliverablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; vendor?: string; function?: string; linked?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, vendor: initialVendor, function: initialFunction, linked: initialLinked } =
    (await searchParams) ?? {};
  const [event, mediaDeliverables, substatuses, responsiblePartyVendors, functions, presentations, mediaTypeOptions, hiddenColumns] =
    await Promise.all([
      getEvent(eventId),
      getMediaDeliverables(eventId),
      getSubstatusOptions(),
      getResponsiblePartyVendors(eventId, "MEDIA_DELIVERABLE"),
      getFunctionOptions(eventId),
      getPresentationOptions(eventId),
      getOptions("media_type"),
      getHiddenColumns("media_deliverables"),
    ]);

  if (!event) notFound();

  const workflowSummaries = mediaDeliverables.length > 0
    ? await getWorkflowBadgeSummaries("media_deliverable", mediaDeliverables.map((d) => d.id), eventId)
    : {};

  const vendors = flattenResponsiblePartyOptions(responsiblePartyVendors);

  const deleteMediaDeliverableAction = async (formData: FormData) => {
    "use server";
    await deleteMediaDeliverable(formData.get("mediaDeliverableId") as string, eventId);
  };

  const deleteMediaDeliverablesAction = async (ids: string[]) => {
    "use server";
    await deleteMediaDeliverables(ids, eventId);
  };

  const bulkUpdateAction = async (
    ids: string[],
    updates: {
      status?: EntityStatus;
      substatus?: string | null;
      providerVendorId?: string | null;
      providerContactId?: string | null;
      mediaType?: string | null;
      functionId?: string;
      presentationId?: string;
    }
  ) => {
    "use server";
    await bulkUpdateMediaDeliverables(ids, eventId, updates);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Media Deliverables" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <MediaDeliverableList
        mediaDeliverables={mediaDeliverables}
        eventId={eventId}
        workflowSummaries={workflowSummaries}
        substatuses={substatuses}
        vendors={vendors}
        functions={functions}
        presentations={presentations}
        mediaTypeOptions={mediaTypeOptions}
        initialStatus={initialStatus}
        initialVendor={initialVendor}
        initialFunction={initialFunction}
        initialLinked={initialLinked}
        initialHiddenColumns={hiddenColumns}
        deleteMediaDeliverable={deleteMediaDeliverableAction}
        deleteMediaDeliverables={deleteMediaDeliverablesAction}
        bulkUpdateMediaDeliverables={bulkUpdateAction}
      />
    </>
  );
}
