import { PrismaClient } from "@prisma/client";

// Report-only: lists rows whose end comes before their start, per table, so
// staff can correct them. Saves now leave a stored reversed range alone, but
// changing either end re-runs the check. Changes nothing.
//
//   npx tsx scripts/report-reversed-ranges.ts
const prisma = new PrismaClient();

type Found = { id: string; event: string; what: string; start: Date; end: Date };
type Check = { table: string; pair: string; find: () => Promise<Found[]> };

const eventSelect = { select: { id: true, name: true } } as const;
const eventLabel = (e: { id: string; name: string } | null | undefined) => (e ? `${e.name} (${e.id})` : "(no event)");

// `strict`: the end must be after the start, not merely on or after it.
function reversed(start: Date | null, end: Date | null, strict = false): boolean {
  if (!start || !end) return false;
  return strict ? end <= start : end < start;
}

function pairs<R>(rows: R[], get: (r: R) => { id: string; event: string; what: string; start: Date | null; end: Date | null }, strict = false): Found[] {
  return rows.flatMap((r) => {
    const f = get(r);
    return reversed(f.start, f.end, strict) ? [{ ...f, start: f.start as Date, end: f.end as Date }] : [];
  });
}

const SPEC_PAIRS = [
  ["exhibitorMoveInStart", "exhibitorMoveInEnd"],
  ["exhibitorMoveOutStart", "exhibitorMoveOutEnd"],
  ["contractorMoveInStart", "contractorMoveInEnd"],
  ["contractorMoveOutStart", "contractorMoveOutEnd"],
] as const;

const CHECKS: Check[] = [
  {
    table: "Event",
    pair: "startDate → endDate",
    find: async () =>
      pairs(await prisma.event.findMany({ select: { id: true, name: true, startDate: true, endDate: true } }), (e) => ({
        id: e.id, event: eventLabel(e), what: e.name, start: e.startDate, end: e.endDate,
      })),
  },
  {
    table: "FunctionSchedule",
    pair: "startTime → endTime",
    find: async () =>
      pairs(
        await prisma.functionSchedule.findMany({ select: { id: true, startTime: true, endTime: true, function: { select: { name: true, event: eventSelect } } } }),
        (s) => ({ id: s.id, event: eventLabel(s.function.event), what: s.function.name, start: s.startTime, end: s.endTime }),
        true,
      ),
  },
  {
    table: "TimelineItem",
    pair: "startTime → endTime",
    find: async () =>
      pairs(
        await prisma.timelineItem.findMany({
          select: {
            id: true, label: true, startTime: true, endTime: true,
            cateringOrder: { select: { event: eventSelect } },
            function: { select: { event: eventSelect } },
          },
        }),
        (t) => ({ id: t.id, event: eventLabel(t.cateringOrder?.event ?? t.function?.event), what: t.label, start: t.startTime, end: t.endTime }),
      ),
  },
  {
    table: "HotelProposal",
    pair: "checkIn → checkOut",
    find: async () =>
      pairs(
        await prisma.hotelProposal.findMany({ select: { id: true, checkIn: true, checkOut: true, venue: { select: { name: true } }, event: eventSelect } }),
        (p) => ({ id: p.id, event: eventLabel(p.event), what: p.venue.name, start: p.checkIn, end: p.checkOut }),
        true,
      ),
  },
  {
    table: "HotelProposal",
    pair: "submittedOn → validUntil",
    find: async () =>
      pairs(
        await prisma.hotelProposal.findMany({ select: { id: true, submittedOn: true, validUntil: true, venue: { select: { name: true } }, event: eventSelect } }),
        (p) => ({ id: p.id, event: eventLabel(p.event), what: p.venue.name, start: p.submittedOn, end: p.validUntil }),
      ),
  },
  {
    table: "VendorQuote",
    pair: "submittedOn → validUntil",
    find: async () =>
      pairs(
        await prisma.vendorQuote.findMany({ select: { id: true, submittedOn: true, validUntil: true, vendor: { select: { name: true } }, event: eventSelect } }),
        (q) => ({ id: q.id, event: eventLabel(q.event), what: q.vendor.name, start: q.submittedOn, end: q.validUntil }),
      ),
  },
  {
    // What the booth shows: its own time, else its group's.
    table: "ExhibitBooth",
    pair: "startAt → endAt (with group defaults)",
    find: async () =>
      pairs(
        await prisma.exhibitBooth.findMany({
          select: { id: true, name: true, startAt: true, endAt: true, group: { select: { startAt: true, endAt: true } }, event: eventSelect },
        }),
        (b) => ({
          id: b.id, event: eventLabel(b.event), what: b.name,
          start: b.startAt ?? b.group?.startAt ?? null, end: b.endAt ?? b.group?.endAt ?? null,
        }),
      ),
  },
  {
    table: "ExhibitBoothGroup",
    pair: "startAt → endAt",
    find: async () =>
      pairs(await prisma.exhibitBoothGroup.findMany({ select: { id: true, name: true, startAt: true, endAt: true, event: eventSelect } }), (g) => ({
        id: g.id, event: eventLabel(g.event), what: g.name, start: g.startAt, end: g.endAt,
      })),
  },
  {
    table: "SpeakerProfile",
    pair: "arrivalAt → departureAt",
    find: async () =>
      pairs(
        await prisma.speakerProfile.findMany({
          select: { id: true, arrivalAt: true, departureAt: true, contact: { select: { firstName: true, lastName: true } }, event: eventSelect },
        }),
        (s) => ({ id: s.id, event: eventLabel(s.event), what: `${s.contact.firstName} ${s.contact.lastName}`, start: s.arrivalAt, end: s.departureAt }),
      ),
  },
  ...SPEC_PAIRS.map(([startKey, endKey]): Check => ({
    table: "EventSpecification",
    pair: `${startKey} → ${endKey}`,
    find: async () =>
      pairs(
        await prisma.eventSpecification.findMany({ select: { id: true, [startKey]: true, [endKey]: true, event: eventSelect } }),
        (s) => {
          const row = s as unknown as Record<string, Date | null> & { id: string; event: { id: string; name: string } };
          return { id: row.id, event: eventLabel(row.event), what: "ESG", start: row[startKey], end: row[endKey] };
        },
      ),
  })),
  {
    table: "EventSpecVip",
    pair: "arrivalAt → departureAt",
    find: async () =>
      pairs(await prisma.eventSpecVip.findMany({ select: { id: true, name: true, arrivalAt: true, departureAt: true, event: eventSelect } }), (v) => ({
        id: v.id, event: eventLabel(v.event), what: v.name, start: v.arrivalAt, end: v.departureAt,
      })),
  },
  {
    table: "EventSpecShuttleRoute",
    pair: "startAt → endAt",
    find: async () =>
      pairs(await prisma.eventSpecShuttleRoute.findMany({ select: { id: true, routeName: true, startAt: true, endAt: true, event: eventSelect } }), (r) => ({
        id: r.id, event: eventLabel(r.event), what: r.routeName, start: r.startAt, end: r.endAt,
      })),
  },
  {
    table: "EventSpecCoverage",
    pair: "startAt → endAt",
    find: async () =>
      pairs(await prisma.eventSpecCoverage.findMany({ select: { id: true, kind: true, location: true, startAt: true, endAt: true, event: eventSelect } }), (c) => ({
        id: c.id, event: eventLabel(c.event), what: [c.kind, c.location].filter(Boolean).join(" · "), start: c.startAt, end: c.endAt,
      })),
  },
  {
    table: "EventSpecKey",
    pair: "startAt → endAt",
    find: async () =>
      pairs(await prisma.eventSpecKey.findMany({ select: { id: true, location: true, startAt: true, endAt: true, event: eventSelect } }), (k) => ({
        id: k.id, event: eventLabel(k.event), what: k.location ?? "Keys", start: k.startAt, end: k.endAt,
      })),
  },
  {
    table: "EventPostEventFutureDate",
    pair: "startDate → endDate",
    find: async () =>
      pairs(await prisma.eventPostEventFutureDate.findMany({ select: { id: true, facility: true, startDate: true, endDate: true, event: eventSelect } }), (d) => ({
        id: d.id, event: eventLabel(d.event), what: d.facility ?? "Future date", start: d.startDate, end: d.endDate,
      })),
  },
];

async function main() {
  let total = 0;
  for (const check of CHECKS) {
    const rows = await check.find();
    total += rows.length;
    console.log(`${check.table} (${check.pair}): ${rows.length}`);
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.event}  "${r.what}"  ${r.start.toISOString()} → ${r.end.toISOString()}`);
    }
  }
  console.log(`\n${total} reversed range(s) in all.`);
}

main().finally(() => prisma.$disconnect());
