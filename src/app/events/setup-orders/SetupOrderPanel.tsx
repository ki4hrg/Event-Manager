"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";
import { getSetupOrderDisplayName } from "./utils";

type SetupOrderSummary = {
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
  linkSetupOrder: (setupOrderId: string) => Promise<void>;
  unlinkSetupOrder: (setupOrderId: string) => Promise<void>;
};

export function SetupOrderPanel({
  title = "Setup Orders",
  setupOrders,
  eventId,
  availableSetupOrders,
  newSetupOrderPath,
  linkSetupOrder,
  unlinkSetupOrder,
}: SetupOrderPanelProps) {
  return (
    <LinkedItemsPanel
      title={title}
      items={setupOrders.map((o) => ({
        id: o.id,
        label: getSetupOrderDisplayName(o),
        detailPath: `/events/${eventId}/setup-orders/${o.id}`,
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
