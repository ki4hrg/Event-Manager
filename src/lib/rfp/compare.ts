// Proposal comparison: each proposal answering an RFP against the block it was
// asked for. One group per requested block, plus one for RFP proposals not
// tied to a block. Read by the compare page and its .docx. Pure.
//
// A block can be met by several hotels: a several-property RFP always, a
// one-property RFP when a second offer is accepted. The combined set is the
// accepted proposals plus any picked to try (`combine`); with one hotel or
// more on a several-property RFP, or two or more otherwise, the group sums
// it against the request. A several-property RFP doesn't mark one offer
// short of the whole request — the set's gap and excess carry that.

import type { AmenityStatus, ConcessionMet, HotelChargeKind, HotelChargeScope } from "@prisma/client";
import { CHARGE_SCOPE_LABELS, dateKey, formatDateKey, formatMoney, formatNight, MET_LABELS, type ContractKind, type ProposalStage } from "@/lib/hotels";
import { blockLabel } from "@/lib/rfp/document";
import { spaceSummary, type SpaceRequestDoc, type StoredSpace } from "@/lib/rfp/proposalSpace";

type Dec = { toString(): string } | null;

export type CompareInput = {
  title: string;
  eventName: string;
  multiProperty: boolean;
  amenities: string[]; // requested
  blocks: { id: string; contractType: string; guestType: string | null; targetRate: Dec; nights: { night: Date; rooms: number }[] }[];
  concessions: { id: string; label: string; value: string | null; required: boolean }[];
  meetingSpace: SpaceRequestDoc[];
  mealTypes: string[]; // the F&B the RFP asks hotels to price
  fbMinimum: Dec; // what the RFP states
  proposals: {
    id: string;
    hotel: string;
    status: string;
    stage: ProposalStage | null;
    contractKind: ContractKind | null;
    brand: string | null;
    area: string | null;
    revision: number;
    rfpBlockId: string | null;
    hasBlock: boolean;
    nights: { night: Date; rooms: number | null; rate: Dec }[];
    allowedAttrition: Dec;
    guaranteedRevenue: Dec;
    validUntil: Date | null;
    taxIncluded: boolean | null;
    charges: { chargeType: string; amount: Dec; scope: HotelChargeScope | null; kind: HotelChargeKind }[];
    spaces: StoredSpace[];
    fbMinimum: Dec;
    fbMinimumScope: HotelChargeScope | null;
    fbMinimumNote: string | null;
    fbTaxRate: Dec;
    fbServiceCharge: Dec;
    meals: { mealType: string; price: Dec }[];
    profile: string[]; // the hotel's amenities
    amenities: { label: string; status: AmenityStatus }[]; // as the offer states them
    // Answers to requested concessions (concessionId), and ones offered unasked (label).
    concessions: { concessionId: string | null; label: string | null; offered: string | null; met: ConcessionMet | null }[];
  }[];
};

export type CompareOffer = {
  id: string;
  hotel: string;
  status: string;
  stage: ProposalStage | null;
  // In the combined set: accepted, or picked to try.
  combined: boolean;
  brand: string | null;
  area: string | null;
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
  validUntil: string | null; // YYYY-MM-DD
  taxIncluded: boolean | null;
  charges: string[]; // guest charges
  meetingCharges: string[];
  // Each meeting space request's answer, by request id; then rooms offered unasked.
  spaces: Record<string, string>;
  // Each answered request's 24-hr hold: true, false (declined) or null (not stated).
  holds: Record<string, boolean | null>;
  otherSpaces: string[];
  fbMinimum: string | null;
  fbRates: string | null; // tax and service charge
  meals: Record<string, string>; // by meal type, lower-cased
  // The hotel's profile plus what the offer confirms, less what it says is unavailable.
  amenities: string[];
  unavailable: string[];
  concessions: Record<string, { met: ConcessionMet | null; offered: string | null }>;
  alsoOffered: string[];
  met: { met: number; partial: number; notMet: number; requiredNotMet: number };
};

// The combined set summed against the request. over: rooms past the request
// per night, overContracted: the part of it held with attrition (a contract
// type with no kind counts as one).
export type CompareCombined = {
  hotels: string[];
  byNight: Record<string, number>;
  gap: Record<string, number>;
  over: Record<string, number>;
  overContracted: Record<string, number>;
  peak: number;
  roomNights: number;
  avgRate: number | null;
  rateRange: [number, number] | null;
  roomRevenue: number | null;
  brands: number;
  areas: number;
};

export type CompareGroup = {
  label: string;
  requested: { byNight: Record<string, number>; peak: number; roomNights: number; targetRate: number | null } | null;
  nights: string[];
  offers: CompareOffer[];
  combined: CompareCombined | null;
};

export type RfpComparison = {
  title: string;
  eventName: string;
  multiProperty: boolean;
  amenities: string[];
  concessions: CompareInput["concessions"];
  meetingSpace: SpaceRequestDoc[];
  mealTypes: string[];
  fbMinimum: string | null;
  groups: CompareGroup[];
};

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);
const num = (d: Dec) => (d == null ? null : Number(d.toString()));
const amountLine = (amount: Dec, scope: HotelChargeScope | null) =>
  [amount != null ? formatMoney(amount.toString()) : null, scope ? CHARGE_SCOPE_LABELS[scope].toLowerCase() : null].filter(Boolean).join(" ");

function byNight(nights: { night: Date; rooms: number | null }[]) {
  const out: Record<string, number> = {};
  for (const n of nights) out[dateKey(n.night)] = (out[dateKey(n.night)] ?? 0) + (n.rooms ?? 0);
  return out;
}

function offer(
  p: CompareInput["proposals"][number],
  requested: Record<string, number> | null,
  concessions: CompareInput["concessions"],
  combine: Set<string>,
): CompareOffer {
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
    stage: p.stage,
    combined: p.stage === "ACCEPTED" || (p.stage !== "DECLINED" && combine.has(p.id)),
    brand: p.brand,
    area: p.area,
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
    validUntil: p.validUntil ? dateKey(p.validUntil) : null,
    taxIncluded: p.taxIncluded,
    charges: p.charges.filter((c) => c.kind === "GUEST").map((c) => [c.chargeType, amountLine(c.amount, c.scope)].filter(Boolean).join(" ")),
    meetingCharges: p.charges.filter((c) => c.kind === "MEETING").map((c) => [c.chargeType, amountLine(c.amount, c.scope)].filter(Boolean).join(" ")),
    spaces: Object.fromEntries(p.spaces.flatMap((r) => (r.spaceRequestId ? [[r.spaceRequestId, spaceSummary(r)]] : []))),
    holds: Object.fromEntries(p.spaces.flatMap((r) => (r.spaceRequestId ? [[r.spaceRequestId, r.hold24]] : []))),
    otherSpaces: p.spaces.filter((r) => !r.spaceRequestId).map((r) => `${r.name}: ${spaceSummary(r)}`),
    fbMinimum: p.fbMinimum != null ? [amountLine(p.fbMinimum, p.fbMinimumScope), p.fbMinimumNote].filter(Boolean).join(" · ") : null,
    fbRates:
      [p.fbTaxRate != null ? `${num(p.fbTaxRate)}% tax` : null, p.fbServiceCharge != null ? `${num(p.fbServiceCharge)}% service` : null].filter(Boolean).join(" · ") ||
      null,
    meals: Object.fromEntries(p.meals.map((m) => [m.mealType.toLowerCase(), m.price != null ? formatMoney(m.price.toString()) : "—"])),
    amenities: Array.from(new Set([...p.profile, ...p.amenities.filter((a) => a.status === "CONFIRMED").map((a) => a.label)])).filter(
      (a) => !p.amenities.some((x) => x.label === a && x.status === "UNAVAILABLE"),
    ),
    unavailable: p.amenities.filter((a) => a.status === "UNAVAILABLE").map((a) => a.label),
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

function combinedOf(
  offers: CompareOffer[],
  kinds: Map<string, ContractKind | null>,
  requested: Record<string, number> | null,
  nightsOf: Map<string, CompareInput["proposals"][number]["nights"]>,
): CompareCombined {
  const set = offers.filter((o) => o.combined);
  const rooms: Record<string, number> = {};
  const contracted: Record<string, number> = {};
  for (const o of set) {
    for (const [night, n] of Object.entries(o.byNight)) {
      rooms[night] = (rooms[night] ?? 0) + n;
      if (kinds.get(o.id) !== "COURTESY") contracted[night] = (contracted[night] ?? 0) + n;
    }
  }
  const gap: Record<string, number> = {};
  const over: Record<string, number> = {};
  const overContracted: Record<string, number> = {};
  if (requested) {
    for (const night of Array.from(new Set([...Object.keys(requested), ...Object.keys(rooms)]))) {
      const want = requested[night] ?? 0;
      const have = rooms[night] ?? 0;
      if (have < want) gap[night] = want - have;
      if (have > want) over[night] = have - want;
      if ((contracted[night] ?? 0) > want) overContracted[night] = contracted[night] - want;
    }
  }
  const priced = set.flatMap((o) => (nightsOf.get(o.id) ?? []).filter((n) => n.rooms && n.rate != null));
  const pricedRooms = sum(priced.map((n) => n.rooms!));
  const revenue = sum(priced.map((n) => n.rooms! * num(n.rate)!));
  const rates = set.flatMap((o) => (o.avgRate != null ? [o.avgRate] : []));
  const distinct = (vs: (string | null)[]) => new Set(vs.filter(Boolean)).size;
  return {
    hotels: set.map((o) => o.hotel),
    byNight: rooms,
    gap,
    over,
    overContracted,
    peak: Math.max(0, ...Object.values(rooms)),
    roomNights: sum(Object.values(rooms)),
    avgRate: pricedRooms ? Math.round((revenue / pricedRooms) * 100) / 100 : null,
    rateRange: rates.length ? [Math.min(...rates), Math.max(...rates)] : null,
    roomRevenue: priced.length ? revenue : null,
    brands: distinct(set.map((o) => o.brand)),
    areas: distinct(set.map((o) => o.area)),
  };
}

function group(
  label: string,
  requested: CompareGroup["requested"],
  proposals: CompareInput["proposals"],
  input: CompareInput,
  combine: Set<string>,
): CompareGroup {
  const offers = proposals
    .map((p) => offer(p, requested?.byNight ?? null, input.concessions, combine))
    // Several properties: by price point, low to high (unpriced last).
    .sort((a, b) => (input.multiProperty ? (a.avgRate ?? Infinity) - (b.avgRate ?? Infinity) : 0) || a.hotel.localeCompare(b.hotel));
  const nights = Array.from(new Set([...Object.keys(requested?.byNight ?? {}), ...offers.flatMap((o) => Object.keys(o.byNight))])).sort();
  const inSet = offers.filter((o) => o.combined).length;
  const combined =
    inSet >= (input.multiProperty ? 1 : 2)
      ? combinedOf(
          offers,
          new Map(proposals.map((p) => [p.id, p.contractKind])),
          requested?.byNight ?? null,
          new Map(proposals.map((p) => [p.id, p.nights])),
        )
      : null;
  return { label, requested, nights, offers, combined };
}

// combine: proposal ids to try in the combined set beside the accepted ones;
// ids that aren't this RFP's proposals are ignored.
export function buildComparison(input: CompareInput, combine: string[] = []): RfpComparison {
  const picked = new Set(combine);
  const groups = input.blocks.map((b) => {
    const req = byNight(b.nights);
    return group(
      blockLabel(b.contractType, b.guestType),
      { byNight: req, peak: Math.max(0, ...Object.values(req)), roomNights: sum(Object.values(req)), targetRate: num(b.targetRate) },
      input.proposals.filter((p) => p.rfpBlockId === b.id),
      input,
      picked,
    );
  });
  const loose = input.proposals.filter((p) => !p.rfpBlockId || !input.blocks.some((b) => b.id === p.rfpBlockId));
  if (loose.length) groups.push(group("Not tied to a requested block", null, loose, input, picked));
  return {
    title: input.title,
    eventName: input.eventName,
    multiProperty: input.multiProperty,
    amenities: input.amenities,
    concessions: input.concessions,
    meetingSpace: input.meetingSpace,
    mealTypes: input.mealTypes,
    fbMinimum: input.fbMinimum != null ? formatMoney(input.fbMinimum.toString()) : null,
    groups,
  };
}

// ?combine=id1,id2 — the proposals tried in the combined set.
export const COMBINE_PARAM = "combine";
export function parseCombine(param: string | string[] | undefined): string[] {
  return (Array.isArray(param) ? param.join(",") : (param ?? "")).split(",").filter(Boolean);
}
export function combineQuery(ids: string[]): string {
  return ids.length ? `?${COMBINE_PARAM}=${ids.map(encodeURIComponent).join(",")}` : "";
}

// "Hilton, Marriott · 2 brands · 1 area"
export function combinedSummary(c: CompareCombined): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [c.hotels.join(", "), c.brands ? plural(c.brands, "brand") : null, c.areas ? plural(c.areas, "area") : null].filter(Boolean).join(" · ");
}

export function metSummary(o: CompareOffer, total: number): string {
  if (total === 0) return "—";
  return [`${o.met.met}/${total} met`, o.met.partial ? `${o.met.partial} partial` : null, o.met.requiredNotMet ? `${o.met.requiredNotMet} required open` : null]
    .filter(Boolean)
    .join(" · ");
}

// combined: the combined set's value, when the group has one ("" where a
// measure doesn't sum).
export type CompareRow = { label: string; requested: string; combined: { text: string; short: boolean } | null; cells: { text: string; short: boolean }[] };

const money = (n: number | null) => (n == null ? "—" : formatMoney(n));

// The comparison table for one group as text, shared by the page and the
// .docx: one row per measure, concession and night; `short` marks a cell
// that falls short of the request.
export function comparisonRows(
  g: CompareGroup,
  concessions: CompareInput["concessions"],
  amenities: string[] = [],
  asked: Pick<RfpComparison, "meetingSpace" | "mealTypes" | "fbMinimum" | "multiProperty"> = { meetingSpace: [], mealTypes: [], fbMinimum: null, multiProperty: false },
): CompareRow[] {
  const req = g.requested;
  const c = g.combined;
  // One offer of several isn't short for holding part of the request.
  const whole = !asked.multiProperty;
  const share = (n: number, of: number) => (asked.multiProperty && of > 0 ? ` · ${Math.round((n / of) * 100)}%` : "");
  const row = (
    label: string,
    requested: string,
    cell: (o: CompareOffer) => { text: string; short?: boolean },
    combined?: { text: string; short?: boolean },
  ): CompareRow => ({
    label,
    requested,
    combined: c ? { text: combined?.text ?? "", short: combined?.short ?? false } : null,
    cells: g.offers.map((o) => {
      const v = cell(o);
      return { text: v.text, short: v.short ?? false };
    }),
  });
  const nightMark = (night: string) => {
    if (!c) return { text: "" };
    const n = c.byNight[night] ?? 0;
    if (c.gap[night]) return { text: `${n} (−${c.gap[night]})`, short: true };
    if (c.overContracted[night]) return { text: `${n} (+${c.over[night]}, ${c.overContracted[night]} contracted)`, short: true };
    if (c.over[night]) return { text: `${n} (+${c.over[night]})` };
    return { text: String(n) };
  };
  const anyOverContracted = !!c && Object.keys(c.overContracted).length > 0;
  return [
    row(
      "Status",
      "",
      (o) => ({ text: `${o.status}${o.revision > 1 ? ` · rev ${o.revision}` : ""}${o.hasBlock ? " · block" : ""}${c && o.combined ? " · combined" : ""}` }),
      c ? { text: `${c.hotels.length} ${c.hotels.length === 1 ? "hotel" : "hotels"}` } : undefined,
    ),
    row(
      "Room nights",
      req ? String(req.roomNights) : "—",
      (o) => ({ text: `${o.roomNights}${share(o.roomNights, req?.roomNights ?? 0)}`, short: whole && !!req && o.roomNights < req.roomNights }),
      c
        ? {
            text: `${c.roomNights}${req && c.roomNights !== req.roomNights ? ` (${c.roomNights > req.roomNights ? "+" : "−"}${Math.abs(c.roomNights - req.roomNights)})` : ""}`,
            short: (!!req && c.roomNights < req.roomNights) || anyOverContracted,
          }
        : undefined,
    ),
    row(
      "Peak night",
      req ? String(req.peak) : "—",
      (o) => ({ text: String(o.peak), short: whole && !!req && o.peak < req.peak }),
      c ? { text: String(c.peak), short: !!req && c.peak < req.peak } : undefined,
    ),
    row(
      "Average rate",
      req?.targetRate != null ? `target ${money(req.targetRate)}` : "—",
      (o) => ({
        text: `${money(o.avgRate)}${o.avgRate != null && o.taxIncluded === true ? " incl. tax" : ""}`,
        short: req?.targetRate != null && o.avgRate != null && o.avgRate > req.targetRate,
      }),
      c
        ? {
            text: `${money(c.avgRate)}${c.rateRange && c.rateRange[0] !== c.rateRange[1] ? `\n${money(c.rateRange[0])}–${money(c.rateRange[1])}` : ""}`,
            short: req?.targetRate != null && c.avgRate != null && c.avgRate > req.targetRate,
          }
        : undefined,
    ),
    row("Room revenue", "", (o) => ({ text: money(o.roomRevenue) }), c ? { text: money(c.roomRevenue) } : undefined),
    row("Attrition", "", (o) => ({ text: o.attrition ?? "—" })),
    row("Guaranteed revenue", "", (o) => ({ text: o.guaranteedRevenue ?? "—" })),
    row("Valid until", "", (o) => ({ text: o.validUntil ? formatDateKey(o.validUntil) : "—" })),
    row("Guest charges", "", (o) => ({ text: o.charges.join("\n") || "—" })),
    // Function space: each meeting space request's answer, rooms offered
    // unasked, and charges not tied to a room.
    ...asked.meetingSpace.map((r) =>
      // A hold the RFP asks for and the hotel declines or doesn't mention falls short.
      row(`${r.when} · ${r.name}`, r.asked ?? "", (o) => {
        const unstated = r.hold24 && o.spaces[r.id] != null && o.holds[r.id] == null;
        return {
          text: o.spaces[r.id] ? `${o.spaces[r.id]}${unstated ? " · 24-hr hold not stated" : ""}` : "—",
          short: !o.spaces[r.id] || (r.hold24 && o.holds[r.id] !== true),
        };
      }),
    ),
    ...(g.offers.some((o) => o.otherSpaces.length) ? [row("Other rooms offered", "", (o) => ({ text: o.otherSpaces.join("\n") || "—" }))] : []),
    row("Meeting space charges", "", (o) => ({ text: o.meetingCharges.join("\n") || "—" })),
    row("F&B minimum", asked.fbMinimum ?? "", (o) => ({ text: o.fbMinimum ?? "—" })),
    row("F&B tax & service", "", (o) => ({ text: o.fbRates ?? "—" })),
    ...asked.mealTypes.map((m) => row(`${m} (per person)`, "", (o) => ({ text: o.meals[m.toLowerCase()] ?? "—" }))),
    row("Amenities", amenities.join(", "), (o) => {
      const missing = amenities.filter((a) => !o.amenities.includes(a) && !o.unavailable.includes(a));
      const lost = amenities.filter((a) => o.unavailable.includes(a));
      return {
        text: [
          o.amenities.join(", ") || "—",
          o.unavailable.length ? `unavailable ${o.unavailable.join(", ")}` : null,
          missing.length ? `missing ${missing.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        short: missing.length > 0 || lost.length > 0,
      };
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
      row(
        formatNight(night),
        req ? String(req.byNight[night] ?? 0) : "",
        (o) =>
          whole
            ? { text: `${o.byNight[night] ?? 0}${o.shortfall[night] ? ` (−${o.shortfall[night]})` : ""}`, short: !!o.shortfall[night] }
            : { text: String(o.byNight[night] ?? 0) },
        nightMark(night),
      ),
    ),
  ];
}
