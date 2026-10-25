import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createHotelProposalCore,
  deleteHotelProposalCore,
  proposalValuesInclude,
  updateHotelProposalCore,
  writeArgsOf,
  type ProposalAmenityArgs,
  type ProposalWriteArgs,
} from "@/app/events/hotels/core";
import {
  clearPickupCore,
  createHotelBlockCore,
  deleteHotelBlockCore,
  importPickupGuestsCore,
  savePickupCountsCore,
  toBlockValues,
  updateHotelBlockCore,
  updatePickupGuestCore,
  type BlockWriteArgs,
  type PickupCountArgs,
  type PickupGuestArgs,
} from "@/app/events/hotels/blockCore";
import { getHotelInfoReportData } from "@/app/events/reports/data";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { CHARGE_SCOPES, isChargeScope } from "@/lib/hotels";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

const SCOPE_VALUES = CHARGE_SCOPES.map((s) => s.value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Partial-update merge: a key present in args (null clears) replaces the
// current value; absent keys keep it.
function merged<T extends object>(current: T, args: Record<string, unknown>, keys: readonly (keyof T)[]): T {
  const out = { ...current };
  for (const k of keys) {
    if (!(k in args)) continue;
    const v = args[k as string];
    if (typeof v === "string" && /date|checkIn|checkOut|cutoff|submittedOn|contractedOn/i.test(String(k)) && v && !DATE.test(v)) {
      throw new Error(`${String(k)} must be YYYY-MM-DD`);
    }
    (out as Record<string, unknown>)[k as string] = k === "amenities" ? readProposalAmenities(v) : v === "" ? null : v;
  }
  return out;
}

const SCOPE_ERROR = `scope must be one of ${SCOPE_VALUES.join(", ")}`;

function checkCharges(v: unknown) {
  if (!Array.isArray(v)) return;
  for (const c of v as { scope?: unknown }[]) {
    if (c.scope != null && !isChargeScope(c.scope)) throw new Error(`charge ${SCOPE_ERROR}`);
  }
}

// Function space rows, meeting charges and the F&B minimum's scope, as the
// proposal cores take them.
export function checkProposalExtras(args: Record<string, unknown>) {
  checkCharges(args.meetingCharges);
  if (args.fbMinimumScope != null && !isChargeScope(args.fbMinimumScope)) throw new Error(`fbMinimumScope ${SCOPE_ERROR.slice(6)}`);
  if (args.spaces === undefined) return;
  if (!Array.isArray(args.spaces)) throw new Error("spaces must be a list");
  for (const r of args.spaces as Record<string, unknown>[]) {
    if (typeof r?.name !== "string" && typeof r?.spaceRequestId !== "string") throw new Error("Each space needs a name or a spaceRequestId");
    if (r.rentalScope != null && !isChargeScope(r.rentalScope)) throw new Error(`rentalScope ${SCOPE_ERROR.slice(6)}`);
    if (r.waiverScope != null && !isChargeScope(r.waiverScope)) throw new Error(`waiverScope ${SCOPE_ERROR.slice(6)}`);
    if (r.waiverType != null && !["FB_SPEND", "ROOM_NIGHTS", "OTHER"].includes(String(r.waiverType))) throw new Error("waiverType must be FB_SPEND, ROOM_NIGHTS or OTHER");
  }
}

// A space answering a request is named after it (the form shows the request's name).
export async function nameRequestedSpaces(args: Record<string, unknown>) {
  if (!Array.isArray(args.spaces)) return;
  const rows = args.spaces as Record<string, unknown>[];
  const ids = rows.flatMap((r) => (typeof r.spaceRequestId === "string" ? [r.spaceRequestId] : []));
  const names = new Map(
    ids.length ? (await prisma.rfpSpaceRequest.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]) : [],
  );
  args.spaces = rows.map((r) => ({
    spaceRequestId: typeof r.spaceRequestId === "string" ? r.spaceRequestId : null,
    name: (typeof r.spaceRequestId === "string" ? names.get(r.spaceRequestId) : undefined) ?? String(r.name ?? r.room ?? ""),
    room: typeof r.room === "string" ? r.room : null,
    capacity: typeof r.capacity === "number" ? r.capacity : null,
    hold24: typeof r.hold24 === "boolean" ? r.hold24 : null,
    rental: typeof r.rental === "number" ? r.rental : null,
    rentalScope: r.rentalScope ?? null,
    waiverType: r.waiverType ?? null,
    waiverAmount: typeof r.waiverAmount === "number" ? r.waiverAmount : null,
    waiverScope: r.waiverScope ?? null,
    note: typeof r.note === "string" ? r.note : null,
  }));
}

const nightSchema = {
  type: "object",
  properties: {
    roomType: { type: ["string", "null"], description: "hotel_room_type option label; null = Run of House (may sit beside typed rooms)." },
    night: { type: "string", description: "YYYY-MM-DD — the check-in date of that night." },
    rate: { type: ["number", "null"] },
    rooms: { type: ["integer", "null"] },
  },
  required: ["night"],
} as const;

// PER_NIGHT is per room per night, PER_ROOM once per room for the stay, ONE_TIME once for the group.
const scopeSchema = { type: ["string", "null"], enum: [...SCOPE_VALUES, null] } as const;

// A contract type is the tenant's list, keyed by kind.
export const CONTRACT_TYPE_DESCRIPTION =
  "hotel_contract_type option label (e.g. Contract, Courtesy). The option's group says whether it carries attrition: CONTRACT does, COURTESY is held without it.";

export const chargeSchema = {
  type: "object",
  properties: {
    chargeType: { type: "string", description: "e.g. Resort fee, Parking." },
    amount: { type: ["number", "null"] },
    scope: scopeSchema,
  },
  required: ["chargeType"],
} as const;

// A proposal's function space and F&B; shared with record_rfp_response.
export const proposalSpaceProps = {
  meetingCharges: {
    type: "array",
    items: chargeSchema,
    description: "Meeting space charges not tied to one room (AV, a rental quoted without naming the room). Replaces the list; omit to leave it unchanged.",
  },
  spaces: {
    type: "array",
    description:
      "Function space offered: one row per RFP meeting space request it answers (spaceRequestId: a get_rfp spaceRequests id of kind MEETING, once each; only on a proposal answering that RFP), and rooms offered unasked (spaceRequestId null, name the room or function). Replaces the list; omit to leave it unchanged.",
    items: {
      type: "object",
      properties: {
        spaceRequestId: { type: ["string", "null"] },
        name: { type: ["string", "null"], description: "Unasked rows: the room or function. Requested rows take the request's name." },
        room: { type: ["string", "null"], description: "The room offered." },
        capacity: { type: ["integer", "null"], description: "For the requested set-up." },
        hold24: { type: ["boolean", "null"], description: "24-hour hold available; null when not stated." },
        rental: { type: ["number", "null"] },
        rentalScope: scopeSchema,
        waiverType: { type: ["string", "null"], enum: ["FB_SPEND", "ROOM_NIGHTS", "OTHER", null], description: "What waives the rental." },
        waiverAmount: { type: ["number", "null"], description: "F&B spend in dollars, or a number of room nights." },
        waiverScope: { ...scopeSchema, description: "PER_DAY, PER_NIGHT or PER_STAY." },
        note: { type: ["string", "null"] },
      },
    },
  },
  fbMinimum: { type: ["number", "null"], description: "Minimum F&B spend. Not guaranteedRevenue (the whole agreement's commitment)." },
  fbMinimumScope: { ...scopeSchema, description: "PER_DAY, or PER_STAY for the whole event." },
  fbMinimumNote: { type: ["string", "null"], description: "What the minimum applies to or waives, e.g. \"waives meeting room rental\"." },
  fbTaxRate: { type: ["number", "null"], description: "Standard F&B tax, percent." },
  fbServiceCharge: { type: ["number", "null"], description: "Standard service charge, percent." },
  meals: {
    type: "array",
    description: "Average per-person price by meal type (the RFP's F&B names, or meal_type labels). Replaces the list; omit to leave it unchanged.",
    items: { type: "object", properties: { mealType: { type: "string" }, price: { type: ["number", "null"] } }, required: ["mealType"] },
  },
} as const;

const proposalProps = {
  venueId: { type: "string", description: "The hotel (a venue id; list_venues). Usually one flagged isLodging." },
  status: { type: "string", description: "proposal_status option label. Its group (REQUESTED / PENDING / ACCEPTED / DECLINED) is the stage." },
  leadSourceDirect: { type: "boolean", description: "The hotel generated the lead itself. Excludes leadSourceVendorId." },
  leadSourceVendorId: { type: ["string", "null"], description: "The organization that brought the lead: a vendor tagged LEAD_SOURCE (a CVB, a third-party planner; list_vendors)." },
  leadSourceContactId: { type: ["string", "null"], description: "That lead source's contact (get_vendor contacts)." },
  contractType: { type: ["string", "null"], description: CONTRACT_TYPE_DESCRIPTION },
  guestType: { type: ["string", "null"], description: "Who the rooms are for: a hotel_guest_type option label (Attendees, Staff, …)." },
  submittedOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
  checkIn: { type: ["string", "null"], description: "Earliest check-in, YYYY-MM-DD. Ignored when nights are given: the first night is the check-in." },
  checkOut: { type: ["string", "null"], description: "Latest check-out, YYYY-MM-DD. Ignored when nights are given: the morning after the last night is the check-out." },
  declinedReason: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
  revision: { type: "integer", description: "Raise when the hotel sends a revised offer; freezes the previous revision in the history. Cannot go down." },
  revisionSummary: { type: ["string", "null"], description: "What changed in this revision." },
  allowedAttrition: { type: ["number", "null"], description: "Percent, 0–100." },
  guaranteedRevenue: { type: ["number", "null"] },
  validUntil: { type: ["string", "null"], description: "The offer's deadline (rates good until / contract by), YYYY-MM-DD." },
  taxIncluded: { type: ["boolean", "null"], description: "Whether the quoted rates include taxes and fees; null when the offer doesn't say." },
  amenities: {
    type: "array",
    description:
      "Amenities this offer states, against the hotel's profile (get_venue): CONFIRMED when the offer commits to one, UNAVAILABLE when it says it won't be available for the event, with the offer's wording or dates as note. label is a hotel_amenity option label. Leave out amenities the offer doesn't mention. Replaces the list.",
    items: {
      type: "object",
      properties: {
        label: { type: "string" },
        status: { type: "string", enum: ["CONFIRMED", "UNAVAILABLE"] },
        note: { type: ["string", "null"] },
      },
      required: ["label", "status"],
    },
  },
  nights: { type: "array", items: nightSchema, description: "The full room grid (replaces it). Each night must fall in the stay." },
  charges: { type: "array", items: chargeSchema, description: "Guest charges (resort fee, parking, breakfast): the full list (replaces it)." },
  ...proposalSpaceProps,
  concessions: {
    type: "array",
    description: "Answers to the RFP's concessions (only for a proposal linked to an RFP; ids from get_rfp). Replaces all answers.",
    items: {
      type: "object",
      properties: {
        concessionId: { type: "string" },
        met: { type: ["string", "null"], enum: ["MET", "PARTIAL", "NOT_MET", null] },
        offered: { type: ["string", "null"] },
      },
      required: ["concessionId"],
    },
  },
  offeredConcessions: {
    type: "array",
    description:
      "Concessions the hotel offers that no RFP request covers (breakfast, Wi-Fi, parking…): label is an rfp_concession option label, offered the terms. Replaces the list; omit to leave it unchanged.",
    items: {
      type: "object",
      properties: { label: { type: "string" }, offered: { type: ["string", "null"] } },
      required: ["label"],
    },
  },
} as const;

const PROPOSAL_KEYS = [
  "venueId", "status", "leadSourceDirect", "leadSourceVendorId", "leadSourceContactId", "contractType", "guestType", "submittedOn", "checkIn", "checkOut", "declinedReason", "notes",
  "revision", "revisionSummary", "allowedAttrition", "guaranteedRevenue", "validUntil", "taxIncluded", "amenities", "nights", "charges", "concessions",
  "offeredConcessions", "meetingCharges", "spaces", "fbMinimum", "fbMinimumScope", "fbMinimumNote", "fbTaxRate", "fbServiceCharge", "meals",
] as const satisfies readonly (keyof ProposalWriteArgs)[];

function checkOfferedConcessions(v: unknown) {
  if (v === undefined) return;
  if (!Array.isArray(v) || v.some((c) => typeof (c as { label?: unknown })?.label !== "string")) {
    throw new Error("offeredConcessions must be a list of { label, offered }");
  }
}

// amenities as the proposal cores take them; a bare label reads as CONFIRMED.
export function readProposalAmenities(v: unknown): ProposalAmenityArgs[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new Error("amenities must be a list");
  return v.map((a): ProposalAmenityArgs => {
    if (typeof a === "string") return { label: a, status: "CONFIRMED", note: null };
    const { label, status, note } = (a ?? {}) as Record<string, unknown>;
    if (typeof label !== "string") throw new Error("Each amenity needs a label");
    if (status !== "CONFIRMED" && status !== "UNAVAILABLE") throw new Error("Amenity status must be CONFIRMED or UNAVAILABLE");
    return { label, status, note: typeof note === "string" ? note : null };
  });
}

function checkConcessions(v: unknown) {
  if (v === undefined) return;
  if (!Array.isArray(v)) throw new Error("concessions must be a list");
  for (const c of v as { met?: unknown }[]) {
    if (c.met != null && !["MET", "PARTIAL", "NOT_MET"].includes(String(c.met))) throw new Error("met must be MET, PARTIAL or NOT_MET");
  }
}

async function currentProposal(id: string, eventId: string): Promise<ProposalWriteArgs> {
  const p = await prisma.hotelProposal.findFirst({ where: { id, eventId }, include: proposalValuesInclude });
  if (!p) throw new Error("Proposal not found");
  return writeArgsOf(p);
}

const blockProps = {
  contractType: { type: ["string", "null"], description: CONTRACT_TYPE_DESCRIPTION },
  guestType: { type: ["string", "null"], description: "Who the block's rooms are for: a hotel_guest_type option label (Attendees, Staff, …)." },
  isHq: { type: "boolean", description: "The event's headquarters hotel (only one per event)." },
  checkIn: { type: ["string", "null"], description: "YYYY-MM-DD." },
  checkOut: { type: ["string", "null"], description: "YYYY-MM-DD." },
  reservationMethod: { type: ["string", "null"], description: "reservation_method option label." },
  groupCode: { type: ["string", "null"] },
  bookingLink: { type: ["string", "null"] },
  bookingPhone: { type: ["string", "null"] },
  cutoffDate: { type: ["string", "null"], description: "Reservation cut-off, YYYY-MM-DD." },
  contractedOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
  cutoffExercised: { type: ["boolean", "null"] },
  allowedAttrition: { type: ["number", "null"], description: "Percent, 0–100." },
  guaranteedRevenue: { type: ["number", "null"] },
  distanceMiles: { type: ["number", "null"] },
  driveMinutes: { type: ["integer", "null"] },
  compRooms: { type: ["integer", "null"] },
  staffRooms: { type: ["integer", "null"] },
  notes: { type: ["string", "null"] },
  nights: {
    type: "array",
    description: "The full night list (replaces it). Keep `id` on existing nights; omit it for new ones. A night left out is deleted.",
    items: {
      type: "object",
      properties: {
        id: { type: ["string", "null"] },
        roomType: { type: ["string", "null"] },
        night: { type: "string", description: "YYYY-MM-DD." },
        rate: { type: ["number", "null"] },
        contractedRooms: { type: ["integer", "null"] },
        rooms: { type: "integer", description: "Current (final) blocked rooms." },
        otherReservations: { type: "integer", description: "Reservations not in the hotel's pickup report." },
      },
      required: ["night", "rooms"],
    },
  },
  charges: { type: "array", items: chargeSchema, description: "The full charge list (replaces it)." },
} as const;

const BLOCK_KEYS = Object.keys(blockProps) as (keyof BlockWriteArgs)[];

const blockDetailInclude = {
  nights: { orderBy: [{ night: "asc" as const }, { roomType: "asc" as const }] },
  charges: { orderBy: { sortOrder: "asc" as const } },
  pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
  pickupCounts: { select: { night: true, roomType: true, rooms: true } },
  proposal: { select: { id: true, venue: { select: { id: true, name: true } } } },
};

async function blockEvent(blockId: string): Promise<string> {
  const b = await prisma.hotelBlock.findUnique({ where: { id: blockId }, select: { proposal: { select: { eventId: true } } } });
  if (!b) throw new Error("Block not found");
  return b.proposal.eventId;
}

export const hotelTools: McpToolDefinition[] = [
  {
    name: "list_hotel_proposals",
    description:
      "List an event's hotel proposals: hotel, status, block type, stay dates, revision, lead source, and the blocks booked from it (one per guest type). Returns summary shape — use `get_hotel_proposal` for full detail (room grid, charges, amenities, terms, revision history).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      return prisma.hotelProposal.findMany({
        where: { eventId },
        select: {
          id: true,
          status: true,
          contractType: true,
          guestType: true,
          checkIn: true,
          checkOut: true,
          revision: true,
          leadSourceDirect: true,
          leadSourceVendor: { select: { id: true, name: true } },
          venue: { select: { id: true, name: true } },
          blocks: { select: { id: true, contractType: true, guestType: true }, orderBy: { createdAt: "asc" } },
          rfp: { select: { id: true, title: true } },
          rfpBlockId: true,
        },
        orderBy: [{ venue: { name: "asc" } }, { createdAt: "asc" }],
      });
    },
  },
  {
    name: "get_hotel_proposal",
    description:
      "Get one hotel proposal with its nightly room grid (room type × night: rooms, rate), charges (kind GUEST or MEETING), function space (spaces; spaceRequestId answers that RFP meeting space request), F&B terms and meal prices, amenities, terms, every revision (snapshot + field changes), and — when it answers an RFP — the RFP, its block and concession answers. concessions holds both answers to requested ones (concessionId, met) and ones offered unasked (label).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      return prisma.hotelProposal.findFirst({
        where: { id: requireString(args, "id"), eventId },
        include: {
          ...proposalValuesInclude,
          versions: { orderBy: { revision: "desc" } },
          blocks: { select: { id: true, contractType: true, guestType: true }, orderBy: { createdAt: "asc" } },
          rfp: { select: { id: true, title: true } },
          concessions: { include: { concession: { select: { label: true, value: true, required: true } } }, orderBy: { sortOrder: "asc" } },
        },
      });
    },
  },
  {
    name: "create_hotel_proposal",
    description:
      "Create a hotel's proposal for an event. venueId and status are required; nights is the room grid. For a proposal answering an RFP block, use record_rfp_response instead.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, ...proposalProps },
      required: ["eventId", "venueId", "status"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      checkCharges(args.charges);
      checkProposalExtras(args);
      await nameRequestedSpaces(args);
      if (args.concessions !== undefined) throw new Error("Only a proposal answering an RFP answers requested concessions — use record_rfp_response, or offeredConcessions");
      checkOfferedConcessions(args.offeredConcessions);
      const blank: ProposalWriteArgs = {
        venueId: "", status: "", leadSourceDirect: false, leadSourceVendorId: null, leadSourceContactId: null, contractType: null, guestType: null, submittedOn: null, checkIn: null,
        checkOut: null, declinedReason: null, notes: null, revision: 1, revisionSummary: null, allowedAttrition: null,
        guaranteedRevenue: null, validUntil: null, taxIncluded: null, amenities: [], nights: [], charges: [],
      };
      return createHotelProposalCore(requireString(args, "eventId"), merged(blank, args, PROPOSAL_KEYS), userId);
    },
  },
  {
    name: "update_hotel_proposal",
    description:
      "Update a hotel proposal; omitted fields are unchanged, but `nights`, `charges` (guest), `meetingCharges`, `spaces` and `meals` replace the whole list when given. Raise `revision` (with `revisionSummary`) when the hotel sends a revised offer. `rfpBlockId` links it to the RFP block it answers (null unlinks); moving to another RFP drops its answers to the old RFP's concessions and space requests. An issued hotel RFP closes once every block it requested has a proposal in an ACCEPTED-stage status.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        ...proposalProps,
        rfpBlockId: { type: ["string", "null"], description: "The RFP hotel block this proposal answers (from get_rfp), or null for none." },
      },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
      checkCharges(args.charges);
      checkProposalExtras(args);
      await nameRequestedSpaces(args);
      checkConcessions(args.concessions);
      checkOfferedConcessions(args.offeredConcessions);
      const next = merged(await currentProposal(id, eventId), args, PROPOSAL_KEYS);
      const link = args.rfpBlockId;
      if (link === null || typeof link === "string") next.rfpBlockId = link;
      else if (link !== undefined) throw new Error("rfpBlockId must be a string or null");
      return updateHotelProposalCore(id, eventId, next, userId);
    },
  },
  {
    name: "delete_hotel_proposal",
    description: "Delete a hotel proposal, its documents, revisions and its blocks (with all pickup).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await deleteHotelProposalCore(requireString(args, "id"), requireString(args, "eventId"), userId);
      return { ok: true };
    },
  },
  {
    name: "list_hotel_blocks",
    description:
      "List an event's hotel blocks with hotel, contract and guest type (a hotel can have several blocks from one proposal), HQ flag, stay, cut-off and pickup totals (blocked, contracted, picked up, %, peak night). Returns summary shape — use `get_hotel_block` for full detail (nights with per-night pickup, charges, booking details).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      const blocks = await prisma.hotelBlock.findMany({ where: { proposal: { eventId } }, include: blockDetailInclude });
      return blocks.map((b) => ({
        id: b.id,
        proposalId: b.proposal.id,
        hotel: b.proposal.venue,
        contractType: b.contractType,
        guestType: b.guestType,
        isHq: b.isHq,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        cutoffDate: b.cutoffDate,
        allowedAttrition: b.allowedAttrition,
        pickup: pickupTotals(blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts })),
      }));
    },
  },
  {
    name: "get_hotel_block",
    description:
      "Get one hotel block: booking details, terms, nights (with ids, for update_hotel_block), charges, and pickup per night (blocked, contracted, picked up) from the guest list, entered counts and other reservations.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = await blockEvent(id);
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      const b = await prisma.hotelBlock.findUniqueOrThrow({ where: { id }, include: blockDetailInclude });
      const rows = blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts });
      return { id, eventId, proposalId: b.proposal.id, hotel: b.proposal.venue, ...toBlockValues(b), pickup: { totals: pickupTotals(rows), nights: rows } };
    },
  },
  {
    name: "create_hotel_block",
    description:
      "Add a block from an accepted proposal (status in the ACCEPTED stage). One proposal can become several blocks, one per guest type (attendees and staff from one offer). Copies the stay, terms, charges, contract type and room grid (as contracted rooms); adjust each block's rooms with update_hotel_block.",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: { type: "string" },
        eventId: { type: "string" },
        guestType: { type: ["string", "null"], description: "The block's hotel_guest_type label. Default: the proposal's." },
      },
      required: ["proposalId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createHotelBlockCore(requireString(args, "proposalId"), requireString(args, "eventId"), userId, {
        guestType: args.guestType === undefined ? undefined : typeof args.guestType === "string" ? args.guestType : null,
      }),
  },
  {
    name: "update_hotel_block",
    description: "Update a hotel block; omitted fields are unchanged, but `nights` and `charges` replace the whole list when given (keep night ids).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, ...blockProps }, required: ["id"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = await blockEvent(id);
      await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
      checkCharges(args.charges);
      const b = await prisma.hotelBlock.findUniqueOrThrow({ where: { id }, include: { nights: true, charges: true } });
      const v = toBlockValues(b);
      const num = (x: string | null) => (x == null ? null : Number(x));
      const current: BlockWriteArgs = {
        ...v,
        allowedAttrition: num(v.allowedAttrition),
        guaranteedRevenue: num(v.guaranteedRevenue),
        distanceMiles: num(v.distanceMiles),
        nights: v.nights.map((n) => ({ ...n, rate: num(n.rate) })),
        charges: v.charges.map((c) => ({ ...c, amount: num(c.amount) })),
      };
      return updateHotelBlockCore(id, eventId, merged(current, args, BLOCK_KEYS), userId);
    },
  },
  {
    name: "delete_hotel_block",
    description: "Delete a hotel block and all its pickup. The proposal stays.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await deleteHotelBlockCore(id, await blockEvent(id), userId);
      return { ok: true };
    },
  },
  {
    name: "import_hotel_pickup_guests",
    description:
      "Import the hotel's pickup report (guest list) into a block. MERGE updates guests whose confirmation number the block already has and adds the rest; APPEND adds all; REPLACE drops the block's guests first. Cancelled guests are kept but not counted. bookedOn / cancelledOn (when the report has them) let the PER compute pickup at N days out; a merge never clears a date already known, and before the block starts a guest new in a merge, or newly cancelled, without a date gets today.",
    inputSchema: {
      type: "object",
      properties: {
        blockId: { type: "string" },
        method: { type: "string", enum: ["MERGE", "APPEND", "REPLACE"] },
        fileName: { type: ["string", "null"] },
        guests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              guestName: { type: ["string", "null"] },
              confirmationNumber: { type: ["string", "null"] },
              checkIn: { type: "string", description: "YYYY-MM-DD." },
              checkOut: { type: "string", description: "YYYY-MM-DD." },
              roomType: { type: ["string", "null"], description: "hotel_room_type option label." },
              cancelled: { type: "boolean" },
              rawStatus: { type: ["string", "null"] },
              bookedOn: { type: ["string", "null"], description: "Date the reservation was made, YYYY-MM-DD." },
              cancelledOn: { type: ["string", "null"], description: "Date it was cancelled, YYYY-MM-DD (implies cancelled)." },
            },
            required: ["checkIn", "checkOut"],
          },
        },
      },
      required: ["blockId", "method", "guests"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const blockId = requireString(args, "blockId");
      const method = requireString(args, "method");
      if (!["MERGE", "APPEND", "REPLACE"].includes(method)) throw new Error("method must be MERGE, APPEND or REPLACE");
      if (!Array.isArray(args.guests)) throw new Error("guests must be a list");
      const guests = (args.guests as Record<string, unknown>[]).map(
        (g): PickupGuestArgs => {
          for (const k of ["checkIn", "checkOut"]) if (typeof g[k] !== "string" || !DATE.test(g[k] as string)) throw new Error(`${k} must be YYYY-MM-DD`);
          for (const k of ["bookedOn", "cancelledOn"]) if (g[k] != null && (typeof g[k] !== "string" || !DATE.test(g[k] as string))) throw new Error(`${k} must be YYYY-MM-DD`);
          return {
            bookedOn: (g.bookedOn as string) || null,
            cancelledOn: (g.cancelledOn as string) || null,
            guestName: (g.guestName as string) || null,
            confirmationNumber: (g.confirmationNumber as string) || null,
            checkIn: g.checkIn as string,
            checkOut: g.checkOut as string,
            roomType: (g.roomType as string) || null,
            cancelled: g.cancelled === true || !!g.cancelledOn,
            rawStatus: (g.rawStatus as string) || null,
          };
        },
      );
      return importPickupGuestsCore(
        blockId,
        await blockEvent(blockId),
        { method: method as "MERGE" | "APPEND" | "REPLACE", fileName: (args.fileName as string) || null, guests },
        userId,
      );
    },
  },
  {
    name: "list_hotel_pickup_guests",
    description:
      "List a block's pickup guests (guest name, confirmation #, stay, room type, cancelled, booked / cancelled dates). Filter by confirmation number or to guests missing a booking date.",
    inputSchema: {
      type: "object",
      properties: {
        blockId: { type: "string" },
        confirmationNumber: { type: "string" },
        missingBookedOn: { type: "boolean", description: "Only guests with no booking date." },
      },
      required: ["blockId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const blockId = requireString(args, "blockId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", await blockEvent(blockId));
      return prisma.hotelPickupGuest.findMany({
        where: {
          blockId,
          ...(typeof args.confirmationNumber === "string" && args.confirmationNumber ? { confirmationNumber: args.confirmationNumber } : {}),
          ...(args.missingBookedOn === true ? { bookedOn: null } : {}),
        },
        select: {
          id: true, guestName: true, confirmationNumber: true, checkIn: true, checkOut: true, roomType: true,
          cancelled: true, rawStatus: true, bookedOn: true, cancelledOn: true,
        },
        orderBy: [{ checkIn: "asc" }, { guestName: "asc" }],
      });
    },
  },
  {
    name: "update_hotel_pickup_guest",
    description:
      "Update one pickup guest; omitted fields are unchanged, null clears. Use it to fill in booking / cancel dates. Setting cancelled false clears the cancel date; a cancel date implies cancelled.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Guest id (list_hotel_pickup_guests)." },
        guestName: { type: ["string", "null"] },
        confirmationNumber: { type: ["string", "null"] },
        checkIn: { type: "string", description: "YYYY-MM-DD." },
        checkOut: { type: "string", description: "YYYY-MM-DD." },
        roomType: { type: ["string", "null"] },
        cancelled: { type: "boolean" },
        rawStatus: { type: ["string", "null"] },
        bookedOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
        cancelledOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const g = await prisma.hotelPickupGuest.findUnique({ where: { id }, select: { block: { select: { proposal: { select: { eventId: true } } } } } });
      if (!g) throw new Error("Guest not found");
      const patch: Partial<PickupGuestArgs> = {};
      for (const k of ["guestName", "confirmationNumber", "roomType", "rawStatus"] as const) {
        if (k in args) patch[k] = (args[k] as string) || null;
      }
      for (const k of ["checkIn", "checkOut", "bookedOn", "cancelledOn"] as const) {
        if (!(k in args)) continue;
        const v = args[k];
        if (v != null && (typeof v !== "string" || !DATE.test(v))) throw new Error(`${k} must be YYYY-MM-DD`);
        if (v == null && (k === "checkIn" || k === "checkOut")) throw new Error(`${k} cannot be cleared`);
        patch[k] = (v as string | null) ?? null;
      }
      if (typeof args.cancelled === "boolean") patch.cancelled = args.cancelled;
      if (patch.cancelledOn) patch.cancelled = true;
      return updatePickupGuestCore(id, g.block.proposal.eventId, patch, userId);
    },
  },
  {
    name: "set_hotel_pickup_counts",
    description: "Replace a block's entered nightly pickup counts (used when the hotel reports totals instead of a guest list). roomType null is an all-rooms total.",
    inputSchema: {
      type: "object",
      properties: {
        blockId: { type: "string" },
        counts: {
          type: "array",
          items: {
            type: "object",
            properties: { night: { type: "string" }, roomType: { type: ["string", "null"] }, rooms: { type: "integer" } },
            required: ["night", "rooms"],
          },
        },
      },
      required: ["blockId", "counts"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const blockId = requireString(args, "blockId");
      if (!Array.isArray(args.counts)) throw new Error("counts must be a list");
      const counts = (args.counts as Record<string, unknown>[]).map((c): PickupCountArgs => {
        if (typeof c.night !== "string" || !DATE.test(c.night)) throw new Error("night must be YYYY-MM-DD");
        return { night: c.night, roomType: (c.roomType as string) || null, rooms: Number(c.rooms) };
      });
      await savePickupCountsCore(blockId, await blockEvent(blockId), counts, userId);
      return { ok: true };
    },
  },
  {
    name: "clear_hotel_pickup",
    description: "Remove every pickup guest and entered count from a block (import history stays).",
    inputSchema: { type: "object", properties: { blockId: { type: "string" } }, required: ["blockId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const blockId = requireString(args, "blockId");
      await clearPickupCore(blockId, await blockEvent(blockId), userId);
      return { ok: true };
    },
  },
  {
    name: "get_hotel_info_report",
    description: "Guest-facing Hotel Information for an event: per hotel address, distance, dates, book-by date, group code, booking link/phone, rates by room type, charges, amenities. Mirrors the Hotel Information report.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        guestTypes: { type: "array", items: { type: "string" }, description: "hotel_guest_type labels to include. Default: all." },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      const guestTypes = Array.isArray(args.guestTypes) ? (args.guestTypes as unknown[]).map(String) : [];
      return getHotelInfoReportData(eventId, { guestTypes });
    },
  },
];

