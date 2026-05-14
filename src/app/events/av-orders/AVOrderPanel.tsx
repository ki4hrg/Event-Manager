"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";

type AVOrderSummary = {
  id: string;
  name: string;
};

type AVOrderPanelProps = {
  title?: string;
  avOrders: AVOrderSummary[];
  eventId: string;
  availableAVOrders: AVOrderSummary[];
  newAVOrderPath: string;
  linkAVOrder: (avOrderId: string) => Promise<void>;
  unlinkAVOrder: (avOrderId: string) => Promise<void>;
};

export function AVOrderPanel({
  title = "AV Orders",
  avOrders,
  eventId,
  availableAVOrders,
  newAVOrderPath,
  linkAVOrder,
  unlinkAVOrder,
}: AVOrderPanelProps) {
  return (
    <LinkedItemsPanel
      title={title}
      items={avOrders.map((o) => ({
        id: o.id,
        label: o.name,
        detailPath: `/events/${eventId}/av-orders/${o.id}`,
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
