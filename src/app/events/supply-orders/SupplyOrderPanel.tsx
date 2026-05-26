"use client";

import type { EntityStatus, PackingStatus } from "@prisma/client";
import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { OrderMeta } from "@/components/OrderMeta";
import { packingRollupSummary } from "@/components/PackingStatusRollup";

type SupplyOrderSummary = {
  id: string;
  name: string;
  status?: EntityStatus | null;
  substatus?: string | null;
  notes?: string | null;
  items?: { packingStatus: PackingStatus }[];
  room?: { name: string } | null;
  providerVendor?: { name: string } | null;
  providerContact?: { firstName: string; lastName: string } | null;
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

// Wrap a SupplyOrder's single provider into the shape OrderMeta's `vendors`
// slot expects so we don't have to extend OrderMeta for this one consumer.
function providerAsVendors(order: SupplyOrderSummary): { vendor: { name: string } }[] {
  if (order.providerVendor) return [{ vendor: { name: order.providerVendor.name } }];
  if (order.providerContact) {
    const name = [order.providerContact.firstName, order.providerContact.lastName].filter(Boolean).join(" ");
    return [{ vendor: { name } }];
  }
  return [];
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
            vendors={providerAsVendors(o)}
            fields={[{ label: "Packing", value: packingRollupSummary(o.items ?? []) }]}
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
