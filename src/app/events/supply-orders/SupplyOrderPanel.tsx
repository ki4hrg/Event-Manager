"use client";

import type { PackingStatus } from "@prisma/client";
import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { OrderMeta, type OrderMetaFields } from "@/components/OrderMeta";
import { PACKING_STATUS_LABEL } from "@/lib/statusConstants";

type SupplyOrderSummary = OrderMetaFields & {
  id: string;
  name: string;
  packingStatus?: PackingStatus | null;
  room?: { name: string } | null;
};

type SupplyOrderPanelProps = {
  title?: string;
  supplyOrders: SupplyOrderSummary[];
  eventId: string;
  availableSupplyOrders: SupplyOrderSummary[];
  newSupplyOrderPath: string;
  fillHeight?: boolean;
  linkSupplyOrder: (supplyOrderId: string) => Promise<void>;
  unlinkSupplyOrder: (supplyOrderId: string) => Promise<void>;
};

function displayName(order: SupplyOrderSummary) {
  if (order.room?.name) return `${order.name} → ${order.room.name}`;
  return order.name;
}

export function SupplyOrderPanel({
  title = "Supply Orders",
  supplyOrders,
  eventId,
  availableSupplyOrders,
  newSupplyOrderPath,
  fillHeight,
  linkSupplyOrder,
  unlinkSupplyOrder,
}: SupplyOrderPanelProps) {
  return (
    <LinkedItemsPanel
      title={title}
      fillHeight={fillHeight}
      items={supplyOrders.map((o) => ({
        id: o.id,
        label: displayName(o),
        detailPath: `/events/${eventId}/supply-orders/${o.id}`,
        metadata: (
          <OrderMeta
            status={o.status}
            substatus={o.substatus}
            vendors={o.vendors}
            fields={[{ label: "Packing", value: o.packingStatus ? PACKING_STATUS_LABEL[o.packingStatus] : null }]}
            notes={o.notes}
          />
        ),
      }))}
      availableItems={availableSupplyOrders.map((o) => ({ id: o.id, label: displayName(o) }))}
      linkLabel="Link Existing"
      emptyMessage="No Supply Orders linked."
      newItemPath={newSupplyOrderPath}
      newItemLabel="Create New"
      linkItem={linkSupplyOrder}
      unlinkItem={unlinkSupplyOrder}
    />
  );
}
