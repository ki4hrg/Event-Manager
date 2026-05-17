import type { EntityStatus } from "@prisma/client";
import { EntityStatusBadge } from "./EntityStatusBadge";

type OrderMetaField = { label: string; value: string | number | null | undefined };

export type OrderMetaFields = {
  status?: EntityStatus | null;
  substatus?: string | null;
  notes?: string | null;
  vendors?: { vendor: { name: string } }[];
};

type OrderMetaProps = OrderMetaFields & {
  fields?: (OrderMetaField | null | undefined)[];
};

export function OrderMeta({ status, substatus, vendors, fields, notes }: OrderMetaProps) {
  const vendorNames = (vendors ?? []).map((v) => v.vendor.name).filter(Boolean);
  const visibleFields = (fields ?? []).filter(
    (f): f is OrderMetaField => f != null && f.value != null && f.value !== ""
  );
  const hasAny = status || vendorNames.length > 0 || visibleFields.length > 0 || notes;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
      {status && (
        <div>
          <EntityStatusBadge status={status} substatus={substatus ?? null} />
        </div>
      )}
      {vendorNames.length > 0 && (
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {vendorNames.length === 1 ? "Vendor: " : "Vendors: "}
          </span>
          {vendorNames.join(", ")}
        </div>
      )}
      {visibleFields.map((f) => (
        <div key={f.label}>
          <span className="font-medium text-gray-700 dark:text-gray-300">{f.label}: </span>
          {f.value}
        </div>
      ))}
      {notes && (
        <div className="whitespace-pre-wrap">
          <span className="font-medium text-gray-700 dark:text-gray-300">Notes: </span>
          {notes}
        </div>
      )}
    </div>
  );
}
