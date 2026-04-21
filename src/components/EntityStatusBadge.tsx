import type { EntityStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_CLASS } from "@/lib/statusConstants";

type Props = {
  status: EntityStatus | null;
  substatus?: string | null;
};

export function EntityStatusBadge({ status, substatus }: Props) {
  if (!status) return null;
  return (
    <span className={`inline-flex flex-col items-start px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[status]}`}>
      <span>{STATUS_LABEL[status]}</span>
      {substatus && (
        <span className="font-normal opacity-80">{substatus}</span>
      )}
    </span>
  );
}
