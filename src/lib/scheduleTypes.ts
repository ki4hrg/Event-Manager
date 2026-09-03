import { prisma } from "@/lib/prisma";

// FunctionSchedule.type stores a "schedule_type" CustomOption label, and every
// consumer (agenda colours, Event Schedule / Room Schedule type filters, share
// links) matches on that label. Writers that need a default must therefore pick
// a real option rather than a hard-coded token — "SESSION" / "MAIN" used to be
// written here and matched nothing, so those rows vanished from any
// type-filtered view.
export const PREFERRED_DEFAULT_SCHEDULE_TYPE = "Main Event";

export async function defaultScheduleType(): Promise<string> {
  const options = await prisma.customOption.findMany({
    where: { category: "schedule_type" },
    orderBy: { sortOrder: "asc" },
    select: { label: true },
  });
  const preferred = options.find((o) => o.label === PREFERRED_DEFAULT_SCHEDULE_TYPE);
  return preferred?.label ?? options[0]?.label ?? PREFERRED_DEFAULT_SCHEDULE_TYPE;
}
