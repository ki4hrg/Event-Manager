"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { OrderMeta, type OrderMetaFields } from "@/components/OrderMeta";
import { getSetupOrderDisplayName } from "./utils";

type SetupOrderSummary = OrderMetaFields & {
  id: string;
  description?: string | null;
  setupType?: string | null;
  name?: string | null;
  room?: { name: string } | null;
};

type SetupOrderPanelProps = {
  title?: string;
  setupOrders: SetupOrderSummary[];
  eventId: string;
  availableSetupOrders: SetupOrderSummary[];
  newSetupOrderPath: string;
  fillHeight?: boolean;
  linkSetupOrder: (setupOrderId: string) => Promise<void>;
  unlinkSetupOrder: (setupOrderId: string) => Promise<void>;
};

export function SetupOrderPanel({
  title = "Setup Orders",
  setupOrders,
  eventId,
  availableSetupOrders,
  newSetupOrderPath,
  fillHeight,
  linkSetupOrder,
  unlinkSetupOrder,
}: SetupOrderPanelProps) {
  return (
    <LinkedItemsPanel
      resource="SETUP_ORDERS"
      title={title}
      fillHeight={fillHeight}
      items={setupOrders.map((o) => ({
        id: o.id,
        label: getSetupOrderDisplayName(o),
        detailPath: `/events/${eventId}/setup-orders/${o.id}`,
        metadata: (
          <OrderMeta
            status={o.status}
            substatus={o.substatus}
            vendors={o.vendors}
            fields={[{ label: "Setup", value: o.setupType }]}
            notes={o.notes}
          />
        ),
      }))}
      availableItems={availableSetupOrders.map((o) => ({ id: o.id, label: getSetupOrderDisplayName(o) }))}
      linkLabel="Link Existing"
      emptyMessage="No Setup Orders linked."
      newItemPath={newSetupOrderPath}
      newItemLabel="Create New"
      linkItem={linkSetupOrder}
      unlinkItem={unlinkSetupOrder}
    />
  );
}
