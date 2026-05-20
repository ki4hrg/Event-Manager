"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { OrderMeta, type OrderMetaFields } from "@/components/OrderMeta";

type AVOrderSummary = OrderMetaFields & {
  id: string;
  name: string;
};

type AVOrderPanelProps = {
  title?: string;
  avOrders: AVOrderSummary[];
  eventId: string;
  availableAVOrders: AVOrderSummary[];
  newAVOrderPath: string;
  fillHeight?: boolean;
  linkAVOrder: (avOrderId: string) => Promise<void>;
  unlinkAVOrder: (avOrderId: string) => Promise<void>;
};

export function AVOrderPanel({
  title = "AV Orders",
  avOrders,
  eventId,
  availableAVOrders,
  newAVOrderPath,
  fillHeight,
  linkAVOrder,
  unlinkAVOrder,
}: AVOrderPanelProps) {
  return (
    <LinkedItemsPanel
      title={title}
      fillHeight={fillHeight}
      items={avOrders.map((o) => ({
        id: o.id,
        label: o.name,
        detailPath: `/events/${eventId}/av-orders/${o.id}`,
        metadata: (
          <OrderMeta
            status={o.status}
            substatus={o.substatus}
            vendors={o.vendors}
            notes={o.notes}
          />
        ),
      }))}
      availableItems={availableAVOrders.map((o) => ({ id: o.id, label: o.name }))}
      linkLabel="Link Existing"
      emptyMessage="No AV Orders linked."
      newItemPath={newAVOrderPath}
      newItemLabel="Create New"
      linkItem={linkAVOrder}
      unlinkItem={unlinkAVOrder}
    />
  );
}
