// Bid comparison: each proposal answering an RFP against the block it was
// asked for. One group per requested block, plus one for RFP proposals not
// tied to a block. Read by the compare page and its .docx. Pure.

import type { ConcessionMet, HotelChargeScope, HotelContractType } from "@prisma/client";
import { CHARGE_SCOPE_LABELS, dateKey, formatMoney, formatNight, MET_LABELS } from "@/lib/hotels";
import { blockLabel } from "@/lib/rfp/document";

type Dec = { toString(): string } | null;

export type CompareInput = {
  title: string;
  eventName: string;
  amenities: string[]; // requested
  blocks: { id: string; contractType: HotelContractType; guestType: string | null; targetRate: Dec; nights: { night: Date; rooms: number }[] }[];
  concessions: { id: string; label: string; value: string | null; required: boolean }[];
  proposals: {
    id: string;
    hotel: string;
    status: string;
    revision: number;
    rfpBlockId: string | null;
    hasBlock: boolean;
    nights: { night: Date; rooms: number | null; rate: Dec }[];
    allowedAttrition: Dec;
    guaranteedRevenue: Dec;
    charges: { chargeType: string; amount: Dec; scope: HotelChargeScope | null }[];
    amenities: string[];
    // Answers to requested concessions (concessionId), and ones offered unasked (label).
    concessions: { concessionId: string | null; label: string | null; offered: string | null; met: ConcessionMet | null }[];
  }[];
};

export type CompareOffer = {
  id: string;
  hotel: string;
  status: string;
  revision: number;
  hasBlock: boolean;
  byNight: Record<string, number>;
  // Rooms short of the request, per night (only nights that fall short).
  shortfall: Record<string, number>;
  peak: number;
  roomNights: number;
  avgRate: number | null;
  roomRevenue: number | null;
  attrition: string | null;
  guaranteedRevenue: string | null;
  charges: string[];
  amenities: string[];
  concessions: Record<string, { met: ConcessionMet | null; offered: string | null }>;
  alsoOffered: string[];
  met: { met: number; partial: number; notMet: number; requiredNotMet: number };
};

export type CompareGroup = {
  label: string;
  requested: { byNight: Record<string, number>; peak: number; roomNights: number; targetRate: number | null } | null;
  nights: string[];
  offers: CompareOffer[];
};

export type RfpComparison = {
  title: string;
  eventName: string;
  amenities: string[];
  concessions: CompareInput["concessions"];
  groups: CompareGroup[];
};

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);
const num = (d: Dec) => (d == null ? null : Number(d.toString()));

function byNight(nights: { night: Date; rooms: number | null }[]) {
  const out: Record<string, number> = {};
  for (const n of nights) out[dateKey(n.night)] = (out[dateKey(n.night)] ?? 0) + (n.rooms ?? 0);
  return out;
}

function offer(p: CompareInput["proposals"][number], requested: Record<string, number> | null, concessions: CompareInput["concessions"]): CompareOffer {
  const rooms = byNight(p.nights);
  const priced = p.nights.filter((n) => n.rooms && n.rate != null);
  const revenue = sum(priced.map((n) => n.rooms! * num(n.rate)!));
  const pricedRooms = sum(priced.map((n) => n.rooms!));
  const shortfall: Record<string, number> = {};
  for (const [night, want] of Object.entries(requested ?? {})) {
    const short = want - (rooms[night] ?? 0);
    if (short > 0) shortfall[night] = short;
  }
  const answers = Object.fromEntries(p.concessions.flatMap((c) => (c.concessionId ? [[c.concessionId, { met: c.met, offered: c.offered }]] : [])));
  const metOf = (id: string) => answers[id]?.met ?? null;
  return {
    id: p.id,
    hotel: p.hotel,
    status: p.status,
    revision: p.revision,
    hasBlock: p.hasBlock,
    byNight: rooms,
    shortfall,
    peak: Math.max(0, ...Object.values(rooms)),
    roomNights: sum(Object.values(rooms)),
    avgRate: pricedRooms ? Math.round((revenue / pricedRooms) * 100) / 100 : null,
    roomRevenue: priced.length ? revenue : null,
    attrition: p.allowedAttrition != null ? `${num(p.allowedAttrition)}%` : null,
    guaranteedRevenue: p.guaranteedRevenue != null ? formatMoney(p.guaranteedRevenue.toString()) : null,
    charges: p.charges.map((c) =>
      [c.chargeType, c.amount != null ? formatMoney(c.amount.toString()) : null, c.scope ? CHARGE_SCOPE_LABELS[c.scope].toLowerCase() : null].filter(Boolean).join(" "),
    ),
    amenities: p.amenities,
    concessions: answers,
    alsoOffered: p.concessions.flatMap((c) => (c.label ? [[c.label, c.offered].filter(Boolean).join(": ")] : [])),
    met: {
      met: concessions.filter((c) => metOf(c.id) === "MET").length,
      partial: concessions.filter((c) => metOf(c.id) === "PARTIAL").length,
      notMet: concessions.filter((c) => metOf(c.id) === "NOT_MET").length,
      requiredNotMet: concessions.filter((c) => c.required && metOf(c.id) !== "MET").length,
    },
  };
}

function group(label: string, requested: CompareGroup["requested"], proposals: CompareInput["proposals"], concessions: CompareInput["concessions"]): CompareGroup {
  const offers = proposals.map((p) => offer(p, requested?.byNight ?? null, concessions)).sort((a, b) => a.hotel.localeCompare(b.hotel));
  const nights = Array.from(new Set([...Object.keys(requested?.byNight ?? {}), ...offers.flatMap((o) => Object.keys(o.byNight))])).sort();
  return { label, requested, nights, offers };
}

export function buildComparison(input: CompareInput): RfpComparison {
  const groups = input.blocks.map((b) => {
    const req = byNight(b.nights);
    return group(
      blockLabel(b.contractType, b.guestType),
      { byNight: req, peak: Math.max(0, ...Object.values(req)), roomNights: sum(Object.values(req)), targetRate: num(b.targetRate) },
      input.proposals.filter((p) => p.rfpBlockId === b.id),
      input.concessions,
    );
  });
  const loose = input.proposals.filter((p) => !p.rfpBlockId || !input.blocks.some((b) => b.id === p.rfpBlockId));
  if (loose.length) groups.push(group("Not tied to a requested block", null, loose, input.concessions));
  return { title: input.title, eventName: input.eventName, amenities: input.amenities, concessions: input.concessions, groups };
}

export function metSummary(o: CompareOffer, total: number): string {
  if (total === 0) return "—";
  return [`${o.met.met}/${total} met`, o.met.partial ? `${o.met.partial} partial` : null, o.met.requiredNotMet ? `${o.met.requiredNotMet} required open` : null]
    .filter(Boolean)
    .join(" · ");
}

export type CompareRow = { label: string; requested: string; cells: { text: string; short: boolean }[] };

const money = (n: number | null) => (n == null ? "—" : formatMoney(n));

// The comparison table for one group as text, shared by the page and the
// .docx: one row per measure, concession and night; `short` marks a cell
// that falls short of the request.
export function comparisonRows(g: CompareGroup, concessions: CompareInput["concessions"], amenities: string[] = []): CompareRow[] {
  const req = g.requested;
  const row = (label: string, requested: string, cell: (o: CompareOffer) => { text: string; short?: boolean }): CompareRow => ({
    label,
    requested,
    cells: g.offers.map((o) => {
      const c = cell(o);
      return { text: c.text, short: c.short ?? false };
    }),
  });
  return [
    row("Status", "", (o) => ({ text: `${o.status}${o.revision > 1 ? ` · rev ${o.revision}` : ""}${o.hasBlock ? " · block" : ""}` })),
    row("Room nights", req ? String(req.roomNights) : "—", (o) => ({ text: String(o.roomNights), short: !!req && o.roomNights < req.roomNights })),
    row("Peak night", req ? String(req.peak) : "—", (o) => ({ text: String(o.peak), short: !!req && o.peak < req.peak })),
    row("Average rate", req?.targetRate != null ? `target ${money(req.targetRate)}` : "—", (o) => ({
      text: money(o.avgRate),
      short: req?.targetRate != null && o.avgRate != null && o.avgRate > req.targetRate,
    })),
    row("Room revenue", "", (o) => ({ text: money(o.roomRevenue) })),
    row("Attrition", "", (o) => ({ text: o.attrition ?? "—" })),
    row("Guaranteed revenue", "", (o) => ({ text: o.guaranteedRevenue ?? "—" })),
    row("Charges", "", (o) => ({ text: o.charges.join("\n") || "—" })),
    row("Amenities", amenities.join(", "), (o) => {
      const missing = amenities.filter((a) => !o.amenities.includes(a));
      return { text: [o.amenities.join(", ") || "—", missing.length ? `missing ${missing.join(", ")}` : null].filter(Boolean).join("\n"), short: missing.length > 0 };
    }),
    ...(concessions.length ? [row("Concessions", `${concessions.length} asked`, (o) => ({ text: metSummary(o, concessions.length), short: o.met.requiredNotMet > 0 }))] : []),
    ...concessions.map((c) =>
      row(`${c.label}${c.required ? " *" : ""}`, c.value ?? "", (o) => {
        const a = o.concessions[c.id];
        return { text: a ? [a.met ? MET_LABELS[a.met] : null, a.offered].filter(Boolean).join(" · ") || "—" : "—", short: a?.met === "NOT_MET" };
      }),
    ),
    row("Also offered", "", (o) => ({ text: o.alsoOffered.join("\n") || "—" })),
    ...g.nights.map((night) =>
      row(formatNight(night), req ? String(req.byNight[night] ?? 0) : "", (o) => ({
        text: `${o.byNight[night] ?? 0}${o.shortfall[night] ? ` (−${o.shortfall[night]})` : ""}`,
        short: !!o.shortfall[night],
      })),
    ),
  ];
}
