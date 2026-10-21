export const MODEL_TYPES = [
  { value: "CATERING_ORDER", label: "Catering Order" },
  { value: "AV_ORDER", label: "AV Order" },
  { value: "SETUP_ORDER", label: "Setup Order" },
  { value: "PRINT_ORDER", label: "Print Order" },
  { value: "SUPPLY_ORDER", label: "Supply Order" },
  { value: "MEDIA_DELIVERABLE", label: "Media Deliverable" },
] as const;

// Roles a vendor plays besides servicing orders, stored in Vendor.models
// alongside the order types. A vendor with only a role isn't general-purpose,
// so it stays out of order pickers.
export const VENDOR_ROLES = [{ value: "LEAD_SOURCE", label: "Lead source" }] as const;

export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
  [...MODEL_TYPES, ...VENDOR_ROLES].map(({ value, label }) => [value, label])
);
