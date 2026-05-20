"use client";

import type { EntityStatus } from "@prisma/client";
import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { OrderMeta } from "@/components/OrderMeta";
import { partyLabel } from "@/lib/partyLabel";

type MediaDeliverableSummary = {
  id: string;
  name: string;
  status?: EntityStatus | null;
  substatus?: string | null;
  notes?: string | null;
  mediaType?: string | null;
  providerVendor?: { name: string } | null;
  providerContact?: { firstName: string; lastName: string } | null;
};

type MediaDeliverablePanelProps = {
  title?: string;
  mediaDeliverables: MediaDeliverableSummary[];
  eventId: string;
  availableMediaDeliverables: MediaDeliverableSummary[];
  newMediaDeliverablePath: string;
  emptyMessage?: string;
  linkMediaDeliverable: (mediaDeliverableId: string) => Promise<void>;
  unlinkMediaDeliverable: (mediaDeliverableId: string) => Promise<void>;
};

export function MediaDeliverablePanel({
  title = "Media Deliverables",
  mediaDeliverables,
  eventId,
  availableMediaDeliverables,
  newMediaDeliverablePath,
  emptyMessage = "No Media Deliverables linked.",
  linkMediaDeliverable,
  unlinkMediaDeliverable,
}: MediaDeliverablePanelProps) {
  return (
    <LinkedItemsPanel
      title={title}
      items={mediaDeliverables.map((d) => ({
        id: d.id,
        label: d.name,
        detailPath: `/events/${eventId}/media-deliverables/${d.id}`,
        metadata: (
          <OrderMeta
            status={d.status}
            substatus={d.substatus}
            notes={d.notes}
            fields={[
              d.mediaType ? { label: "Type", value: d.mediaType } : null,
              { label: "Provider", value: partyLabel(d.providerVendor, d.providerContact) },
            ]}
          />
        ),
      }))}
      availableItems={availableMediaDeliverables.map((d) => ({ id: d.id, label: d.name }))}
      linkLabel="Link Existing"
      emptyMessage={emptyMessage}
      newItemPath={newMediaDeliverablePath}
      newItemLabel="Create New"
      linkItem={linkMediaDeliverable}
      unlinkItem={unlinkMediaDeliverable}
    />
  );
}
