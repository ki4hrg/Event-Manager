import type { HotelBlockType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createHotelProposalCore,
  deleteHotelProposalCore,
  toProposalValues,
  updateHotelProposalCore,
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
import { getHotelInfoReportData } from "@/app/events/reports/actions";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

const BLOCK_TYPES = new Set(["CONTRACT", "COURTESY", "STAFF"]);
const SCOPES = new Set(["PER_NIGHT", "PER_STAY", "PER_PERSON", "PER_PERSON_PER_NIGHT"]);
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
    if (k === "blockType" && v != null && !BLOCK_TYPES.has(String(v))) throw new Error("blockType must be CONTRACT, COURTESY or STAFF");
    (out as Record<string, unknown>)[k as string] = v === "" ? null : v;
  }
  return out;
}

function checkCharges(v: unknown) {
  if (!Array.isArray(v)) return;
  for (const c of v as { scope?: unknown }[]) {
    if (c.scope != null && !SCOPES.has(String(c.scope))) throw new Error("charge scope must be PER_NIGHT, PER_STAY, PER_PERSON or PER_PERSON_PER_NIGHT");
  }
}

const nightSchema = {
  type: "object",
  properties: {
    roomType: { type: ["string", "null"], description: "hotel_room_type option label; null = run of house." },
    night: { type: "string", description: "YYYY-MM-DD — the check-in date of that night." },
    rate: { type: ["number", "null"] },
    rooms: { type: ["integer", "null"] },
  },
  required: ["night"],
} as const;

const chargeSchema = {
  type: "object",
  properties: {
    chargeType: { type: "string", description: "e.g. Resort fee, Parking." },
    amount: { type: ["number", "null"] },
    scope: { type: ["string", "null"], enum: ["PER_NIGHT", "PER_STAY", "PER_PERSON", "PER_PERSON_PER_NIGHT", null] },
  },
  required: ["chargeType"],
} as const;

const proposalProps = {
  venueId: { type: "string", description: "The hotel (a venue id; list_venues). Usually one flagged isLodging." },
  status: { type: "string", description: "proposal_status option label. Its group (REQUESTED / PENDING / ACCEPTED / DECLINED) is the stage." },
  leadSource: { type: ["string", "null"], description: "hotel_lead_source option label." },
  blockType: { type: ["string", "null"], enum: ["CONTRACT", "COURTESY", "STAFF", null] },
  submittedOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
  checkIn: { type: ["string", "null"], description: "Earliest check-in, YYYY-MM-DD." },
  checkOut: { type: ["string", "null"], description: "Latest check-out, YYYY-MM-DD. Nights run check-in up to, not including, check-out." },
  declinedReason: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
  revision: { type: "integer", description: "Raise when the hotel sends a revised offer; freezes the previous revision in the history. Cannot go down." },
  revisionSummary: { type: ["string", "null"], description: "What changed in this revision." },
  isRunOfHouse: { type: "boolean" },
  allowedAttrition: { type: ["number", "null"], description: "Percent, 0–100." },
  guaranteedRevenue: { type: ["number", "null"] },
  amenities: { type: "array", items: { type: "string" }, description: "hotel_amenity option labels." },
  nights: { type: "array", items: nightSchema, description: "The full room grid (replaces it). Each night must fall in the stay." },
  charges: { type: "array", items: chargeSchema, description: "The full charge list (replaces it)." },
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
} as const;

const PROPOSAL_KEYS = [
  "venueId", "status", "leadSource", "blockType", "submittedOn", "checkIn", "checkOut", "declinedReason", "notes", "revision",
  "revisionSummary", "isRunOfHouse", "allowedAttrition", "guaranteedRevenue", "amenities", "nights", "charges", "concessions",
] as const satisfies readonly (keyof ProposalWriteArgs)[];

function checkConcessions(v: unknown) {
  if (v === undefined) return;
  if (!Array.isArray(v)) throw new Error("concessions must be a list");
  for (const c of v as { met?: unknown }[]) {
    if (c.met != null && !["MET", "PARTIAL", "NOT_MET"].includes(String(c.met))) throw new Error("met must be MET, PARTIAL or NOT_MET");
  }
}

const proposalInclude = {
  venue: { select: { name: true } },
  nights: { orderBy: [{ night: "asc" as const }, { roomType: "asc" as const }] },
  charges: { orderBy: { sortOrder: "asc" as const } },
};

async function currentProposal(id: string, eventId: string): Promise<ProposalWriteArgs> {
  const p = await prisma.hotelProposal.findFirst({ where: { id, eventId }, include: proposalInclude });
  if (!p) throw new Error("Proposal not found");
  const v = toProposalValues(p);
  return {
    ...v,
    revisionSummary: null,
    allowedAttrition: v.allowedAttrition == null ? null : Number(v.allowedAttrition),
    guaranteedRevenue: v.guaranteedRevenue == null ? null : Number(v.guaranteedRevenue),
    nights: v.nights.map((n) => ({ ...n, rate: n.rate == null ? null : Number(n.rate) })),
    charges: v.charges.map((c) => ({ ...c, amount: c.amount == null ? null : Number(c.amount) })),
  };
}

const blockProps = {
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
  isRunOfHouse: { type: "boolean" },
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
  proposal: { select: { id: true, blockType: true, venue: { select: { id: true, name: true } } } },
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
      "List an event's hotel proposals: hotel, status, block type, stay dates, revision, lead source, and whether it became a block. Returns summary shape — use `get_hotel_proposal` for full detail (room grid, charges, amenities, terms, revision history).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      return prisma.hotelProposal.findMany({
        where: { eventId },
        select: {
          id: true,
          status: true,
          blockType: true,
          checkIn: true,
          checkOut: true,
          revision: true,
          leadSource: true,
          venue: { select: { id: true, name: true } },
          block: { select: { id: true } },
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
      "Get one hotel proposal with its nightly room grid (room type × night: rooms, rate), charges, amenities, terms, every revision (snapshot + field changes), and — when it answers an RFP — the RFP, its block and concession answers.",
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
          ...proposalInclude,
          versions: { orderBy: { revision: "desc" } },
          block: { select: { id: true } },
          rfp: { select: { id: true, title: true } },
          concessions: { include: { concession: { select: { label: true, value: true, required: true } } } },
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
    handler: (args, { userId }) => {
      checkCharges(args.charges);
      if (args.concessions !== undefined) throw new Error("Only a proposal answering an RFP has concessions — use record_rfp_response");
      const blank: ProposalWriteArgs = {
        venueId: "", status: "", leadSource: null, blockType: null, submittedOn: null, checkIn: null, checkOut: null,
        declinedReason: null, notes: null, revision: 1, revisionSummary: null, isRunOfHouse: false, allowedAttrition: null,
        guaranteedRevenue: null, amenities: [], nights: [], charges: [],
      };
      return createHotelProposalCore(requireString(args, "eventId"), merged(blank, args, PROPOSAL_KEYS), userId);
    },
  },
  {
    name: "update_hotel_proposal",
    description:
      "Update a hotel proposal; omitted fields are unchanged, but `nights` and `charges` replace the whole list when given. Raise `revision` (with `revisionSummary`) when the hotel sends a revised offer.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...proposalProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
      checkCharges(args.charges);
      checkConcessions(args.concessions);
      return updateHotelProposalCore(id, eventId, merged(await currentProposal(id, eventId), args, PROPOSAL_KEYS), userId);
    },
  },
  {
    name: "delete_hotel_proposal",
    description: "Delete a hotel proposal, its documents, revisions and its block (with all pickup).",
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
      "List an event's hotel blocks with hotel, HQ flag, stay, cut-off and pickup totals (blocked, contracted, picked up, %, peak night). Returns summary shape — use `get_hotel_block` for full detail (nights with per-night pickup, charges, booking details).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      const blocks = await prisma.hotelBlock.findMany({ where: { proposal: { eventId } }, include: blockDetailInclude });
      return blocks.map((b) => ({
        id: b.id,
        proposalId: b.proposal.id,
        hotel: b.proposal.venue,
        blockType: b.proposal.blockType,
        isHq: b.isHq,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        cutoffDate: b.cutoffDate,
        allowedAttrition: b.allowedAttrition,
        pickup: pickupTotals(blockPickup({ isRunOfHouse: b.isRunOfHouse, nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts })),
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
      const rows = blockPickup({ isRunOfHouse: b.isRunOfHouse, nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts });
      return { id, eventId, proposalId: b.proposal.id, hotel: b.proposal.venue, ...toBlockValues(b), pickup: { totals: pickupTotals(rows), nights: rows } };
    },
  },
  {
    name: "create_hotel_block",
    description: "Turn an accepted proposal (status in the ACCEPTED stage) into the event's block for that hotel. Copies the stay, terms, charges and room grid (as contracted rooms).",
    inputSchema: {
      type: "object",
      properties: { proposalId: { type: "string" }, eventId: { type: "string" } },
      required: ["proposalId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => createHotelBlockCore(requireString(args, "proposalId"), requireString(args, "eventId"), userId),
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
        blockTypes: { type: "array", items: { type: "string", enum: ["CONTRACT", "COURTESY", "STAFF"] }, description: "Default: all." },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
      const blockTypes = Array.isArray(args.blockTypes) ? (args.blockTypes as string[]).filter((t): t is HotelBlockType => BLOCK_TYPES.has(t)) : [];
      return getHotelInfoReportData(eventId, { blockTypes });
    },
  },
];

