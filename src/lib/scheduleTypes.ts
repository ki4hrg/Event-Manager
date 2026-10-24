import { prisma } from "@/lib/prisma";

// FunctionSchedule.type stores a "schedule_type" CustomOption label, and every
// consumer (agenda colours, Event Schedule / Room Schedule type filters, share
// links) matches on that label. Writers that need a default must therefore pick
// a real option rather than a hard-coded token — "SESSION" / "MAIN" used to be
// written here and matched nothing, so those rows vanished from any
// type-filtered view.
export const PREFERRED_DEFAULT_SCHEDULE_TYPE = "Main Event";

// The schedule_type group marking the main schedule: the one a function is
// dated by (getMainStart) and new schedules default to. Set in Settings, so a
// renamed or translated "Main Event" keeps the role.
export const MAIN_SCHEDULE_GROUP = "MAIN";

// Options are per tenant; `eventId` selects the tenant whose list applies.
// A MAIN-grouped option wins ("Main Event" first if several are, else the
// first by order); a tenant with none falls back to the "Main Event" label,
// then the first option.
export async function defaultScheduleType(eventId: string): Promise<string> {
  const options = await prisma.customOption.findMany({
    where: { category: "schedule_type", tenant: { events: { some: { id: eventId } } } },
    orderBy: { sortOrder: "asc" },
    select: { label: true, group: true },
  });
  const main = options.filter((o) => o.group === MAIN_SCHEDULE_GROUP);
  const pool = main.length > 0 ? main : options;
  const preferred = pool.find((o) => o.label === PREFERRED_DEFAULT_SCHEDULE_TYPE) ?? main[0];
  return preferred?.label ?? options[0]?.label ?? PREFERRED_DEFAULT_SCHEDULE_TYPE;
}

// The labels of the MAIN-grouped schedule types, for getMainStart.
export function mainScheduleTypes(options: { label: string; group: string | null }[]): string[] {
  return options.filter((o) => o.group === MAIN_SCHEDULE_GROUP).map((o) => o.label);
}
