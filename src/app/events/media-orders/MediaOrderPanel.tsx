"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { OrderMeta, type OrderMetaFields } from "@/components/OrderMeta";

type MediaOrderSummary = OrderMetaFields & {
  id: string;
  name: string;
};

type MediaOrderPanelProps = {
  title?: string;
  mediaOrders: MediaOrderSummary[];
  eventId: string;
  availableMediaOrders: MediaOrderSummary[];
  newMediaOrderPath: string;
  emptyMessage?: string;
  linkMediaOrder: (mediaOrderId: string) => Promise<void>;
  unlinkMediaOrder: (mediaOrderId: string) => Promise<void>;
};

export function MediaOrderPanel({
  title = "Media Orders",
  mediaOrders,
  eventId,
  availableMediaOrders,
  newMediaOrderPath,
  emptyMessage = "No Media Orders linked.",
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
        metadata: (
          <OrderMeta
            status={o.status}
            substatus={o.substatus}
            vendors={o.vendors}
            notes={o.notes}
          />
        ),
      }))}
      availableItems={availableMediaOrders.map((o) => ({ id: o.id, label: o.name }))}
      linkLabel="Link Existing"
      emptyMessage={emptyMessage}
      newItemPath={newMediaOrderPath}
      newItemLabel="Create New"
      linkItem={linkMediaOrder}
      unlinkItem={unlinkMediaOrder}
    />
  );
}
