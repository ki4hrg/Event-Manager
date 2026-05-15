"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";

type MediaOrderSummary = {
  id: string;
  name: string;
};

type MediaOrderPanelProps = {
  title?: string;
  mediaOrders: MediaOrderSummary[];
  eventId: string;
  availableMediaOrders: MediaOrderSummary[];
  newMediaOrderPath: string;
  linkMediaOrder: (mediaOrderId: string) => Promise<void>;
  unlinkMediaOrder: (mediaOrderId: string) => Promise<void>;
};

export function MediaOrderPanel({
  title = "Media Orders",
  mediaOrders,
  eventId,
  availableMediaOrders,
  newMediaOrderPath,
  linkMediaOrder,
  unlinkMediaOrder,
}: MediaOrderPanelProps) {
  return (
    <LinkedItemsPanel
      title={title}
      items={mediaOrders.map((o) => ({
        id: o.id,
        label: o.name,
        detailPath: `/events/${eventId}/media-orders/${o.id}`,
      }))}
      availableItems={availableMediaOrders.map((o) => ({ id: o.id, label: o.name }))}
      linkLabel="Link Existing"
      emptyMessage="No Media Orders linked."
      newItemPath={newMediaOrderPath}
      newItemLabel="Create New"
      linkItem={linkMediaOrder}
      unlinkItem={unlinkMediaOrder}
    />
  );
}
