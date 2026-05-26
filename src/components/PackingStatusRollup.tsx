import type { PackingStatus } from "@prisma/client";
import {
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
} from "@/lib/statusConstants";

type Props = {
  items: { packingStatus: PackingStatus }[];
};

function tallyByStatus(items: { packingStatus: PackingStatus }[]) {
  const counts = Object.fromEntries(
    PACKING_STATUS_OPTIONS.map((o) => [o.value, 0]),
  ) as Record<PackingStatus, number>;
  for (const item of items) counts[item.packingStatus]++;
  return counts;
}

export function packingRollupSummary(items: { packingStatus: PackingStatus }[]): string | null {
  if (items.length === 0) return null;
  const counts = tallyByStatus(items);
  const present = PACKING_STATUS_OPTIONS.filter((o) => counts[o.value] > 0);
  if (present.length === 1) return PACKING_STATUS_LABEL[present[0].value];
  return present.map((o) => `${counts[o.value]} ${PACKING_STATUS_LABEL[o.value]}`).join(" · ");
}

export function PackingStatusRollup({ items }: Props) {
  if (items.length === 0) return null;

  const counts = tallyByStatus(items);
  const present = PACKING_STATUS_OPTIONS.filter((o) => counts[o.value] > 0);

  if (present.length === 1) {
    const only = present[0].value;
    return (
      <span className={`text-xs rounded px-2 py-0.5 font-medium ${PACKING_STATUS_CLASS[only]}`}>
        {PACKING_STATUS_LABEL[only]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {present.map((o, i) => (
        <span key={o.value} className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 py-0.5 font-medium ${PACKING_STATUS_CLASS[o.value]}`}>
            {counts[o.value]} {PACKING_STATUS_LABEL[o.value]}
          </span>
          {i < present.length - 1 && <span className="text-gray-400 dark:text-gray-500">·</span>}
        </span>
      ))}
    </span>
  );
}
