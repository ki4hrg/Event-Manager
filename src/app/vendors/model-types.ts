export const MODEL_TYPES = [
  { value: "CATERING_ORDER", label: "Catering Order" },
  { value: "AV_ORDER", label: "AV Order" },
  { value: "SETUP_ORDER", label: "Setup Order" },
  { value: "PRINT_ORDER", label: "Print Order" },
  { value: "SUPPLY_ORDER", label: "Supply Order" },
  { value: "MEDIA_DELIVERABLE", label: "Media Deliverable" },
] as const;

export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
  MODEL_TYPES.map(({ value, label }) => [value, label])
);
