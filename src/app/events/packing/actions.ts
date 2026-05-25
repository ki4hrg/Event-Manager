"use server";

import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hasPermission,
  requirePermission,
  PermissionError,
} from "@/lib/permissions";
import { partyLabel } from "@/lib/partyLabel";

export type PackableItem = {
  kind: "SUPPLY" | "PRINT";
  itemId: string;
  parentOrderId: string;
  parentOrderName: string;
  parentOrderHref: string;
  description: string;
  quantity: number | null;
  acquisitionState: AcquisitionState;
  packingStatus: PackingStatus;
  equipmentCategory: string | null;
  provider: string | null;
  notes: string | null;
};

export type PackingListPayload = {
  items: PackableItem[];
  canSeeSupply: boolean;
  canSeePrint: boolean;
  canWriteSupply: boolean;
  canWritePrint: boolean;
};

export async function getPackingListItems(eventId: string): Promise<PackingListPayload> {
  await requirePermission("EVENTS", "VIEW", eventId);

  const [canSeeSupply, canSeePrint, canWriteSupply, canWritePrint] = await Promise.all([
    hasPermission("SUPPLY_ORDERS", "VIEW", eventId),
    hasPermission("PRINT_ORDERS", "VIEW", eventId),
    hasPermission("SUPPLY_ORDERS", "WRITE", eventId),
    hasPermission("PRINT_ORDERS", "WRITE", eventId),
  ]);

  if (!canSeeSupply && !canSeePrint) {
    throw new PermissionError("FORBIDDEN");
  }

  const [supply, print] = await Promise.all([
    canSeeSupply
      ? prisma.supplyOrderItem.findMany({
          where: { supplyOrder: { eventId } },
          include: {
            supplyOrder: {
              select: {
                id: true,
                name: true,
                providerVendor: { select: { name: true } },
                providerContact: { select: { firstName: true, lastName: true } },
              },
            },
            equipment: { select: { name: true, category: true } },
            providerVendor: { select: { name: true } },
            providerContact: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    canSeePrint
      ? prisma.printItem.findMany({
          where: { printOrder: { eventId } },
          include: {
            printOrder: {
              select: {
                id: true,
                name: true,
                vendors: {
                  include: { vendor: { select: { name: true } } },
                  orderBy: { vendor: { name: "asc" } },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const items: PackableItem[] = [
    ...supply.map((s): PackableItem => {
      const itemProvider = partyLabel(s.providerVendor, s.providerContact);
      const orderProvider = partyLabel(s.supplyOrder.providerVendor, s.supplyOrder.providerContact);
      return {
        kind: "SUPPLY",
        itemId: s.id,
        parentOrderId: s.supplyOrderId,
        parentOrderName: s.supplyOrder.name,
        parentOrderHref: `/events/${eventId}/supply-orders/${s.supplyOrderId}`,
        description: s.description ?? s.equipment?.name ?? "(unnamed item)",
        quantity: s.quantity ?? null,
        acquisitionState: s.acquisitionState,
        packingStatus: s.packingStatus,
        equipmentCategory: s.equipment?.category ?? null,
        provider: itemProvider ?? orderProvider,
        notes: s.notes ?? null,
      };
    }),
    ...print.map((p): PackableItem => ({
      kind: "PRINT",
      itemId: p.id,
      parentOrderId: p.printOrderId,
      parentOrderName: p.printOrder.name,
      parentOrderHref: `/events/${eventId}/print-orders/${p.printOrderId}`,
      description: p.description,
      quantity: p.quantity ?? null,
      acquisitionState: p.acquisitionState,
      packingStatus: p.packingStatus,
      equipmentCategory: null,
      provider: p.printOrder.vendors[0]?.vendor.name ?? null,
      notes: p.notes ?? null,
    })),
  ];

  return { items, canSeeSupply, canSeePrint, canWriteSupply, canWritePrint };
}
