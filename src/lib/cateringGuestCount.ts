export type FirmestGuestCount = { label: "Confirmed" | "Guaranteed" | "Expected"; value: number };

export function firmestGuestCount(order: {
  confirmedCount: number | null;
  guaranteeCount: number | null;
  expectedCount: number | null;
}): FirmestGuestCount | null {
  if (order.confirmedCount != null) return { label: "Confirmed", value: order.confirmedCount };
  if (order.guaranteeCount != null) return { label: "Guaranteed", value: order.guaranteeCount };
  if (order.expectedCount != null) return { label: "Expected", value: order.expectedCount };
  return null;
}
