import type { RfpKind, RfpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import { coveredByProfile, dateKey, labelKey } from "@/lib/hotels";
import { resourceForKind, VENDOR_RFP_KINDS } from "@/lib/rfp/kinds";
import { hasPermissionForUser } from "@/lib/permissions";
import { recipientState } from "@/lib/rfp/recipients";
import { RFP_SECTIONS, sectionsFor } from "@/lib/rfp/sections";
import { sourceOrderId, type LineItemRow } from "@/lib/rfp/lineItems";
import {
  addRfpRecipientsCore,
  addRfpVendorRecipientsCore,
  createRfpCore,
  rfpLineItemCandidatesCore,
  saveRfpLineItemsCore,
  type RfpLineItemArgs,
  deleteRfpCore,
  getRfpComparisonCore,
  getRfpDocumentCore,
  issueRfpCore,
  removeRfpRecipientCore,
  saveRfpBlocksCore,
  saveRfpConcessionsCore,
  saveRfpSpaceCore,
  updateRfpCore,
  updateRfpRecipientCore,
  type RfpBlockArgs,
  type RfpConcessionArgs,
  type RfpSpaceArgs,
  type RfpWriteArgs,
} from "@/app/events/rfps/core";
import { getQuoteComparisonCore } from "@/app/events/quotes/core";
import { createHotelProposalCore, type ProposalConcessionArgs, type ProposalWriteArgs } from "@/app/events/hotels/core";
import { chargeSchema, checkProposalExtras, CONTRACT_TYPE_DESCRIPTION, nameRequestedSpaces, proposalSpaceProps, readProposalAmenities } from "./hotels";
import type { McpToolDefinition } from "./types";
import { partialBoolean, partialInt, partialString, requireString } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["DRAFT", "ISSUED", "CLOSED"]);
const MET = new Set(["MET", "PARTIAL", "NOT_MET"]);

function dateArg(args: Record<string, unknown>, key: string) {
  const v = partialString(args, key);
  if (v && !DATE.test(v)) throw new Error(`${key} must be YYYY-MM-DD`);
  return v;
}

function stringList(args: Record<string, unknown>, key: string): string[] | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`${key} must be a list of strings`);
  return v as string[];
}

// The RFP's kind decides the permission resource; a foreign id reads as not found.
async function rfpFor(id: string, eventId: string, userId: string, action: "VIEW" | "WRITE") {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true } });
  if (!rfp) throw new Error("RFP not found");
  await requirePermissionForUser(userId, resourceForKind(rfp.kind), action, eventId);
  return rfp;
}

const blockSchema = {
  type: "object",
  properties: {
    id: { type: ["string", "null"], description: "An existing block's id (get_rfp) to keep it and the proposals linked to it; omit for a new block." },
    contractType: { type: "string", description: CONTRACT_TYPE_DESCRIPTION },
    guestType: { type: ["string", "null"], description: "Who the rooms are for: a hotel_guest_type option label (Attendees, Staff, …)." },
    targetRate: { type: ["number", "null"] },
    targetRateRequired: { type: "boolean", description: "The target rate is a ceiling (\"must be no more than\") rather than a target. Default false." },
    notes: { type: ["string", "null"] },
    nights: {
      type: "array",
      description: "Requested rooms per night. Nights within 30 days of the event.",
      items: {
        type: "object",
        properties: {
          roomType: { type: ["string", "null"], description: "hotel_room_type option label; null = Run of House (may sit beside typed rooms)." },
          night: { type: "string", description: "YYYY-MM-DD — the check-in date of that night." },
          rooms: { type: "integer" },
        },
        required: ["night", "rooms"],
      },
    },
  },
  required: ["contractType", "nights"],
} as const;

function readBlocks(v: unknown): RfpBlockArgs[] {
  if (!Array.isArray(v)) throw new Error("blocks must be a list");
  return v.map((b: Record<string, unknown>) => {
    if (typeof b.contractType !== "string" || !b.contractType) throw new Error("each block needs a contractType");
    if (!Array.isArray(b.nights)) throw new Error("each block needs nights");
    return {
      id: typeof b.id === "string" ? b.id : null,
      contractType: b.contractType,
      guestType: typeof b.guestType === "string" ? b.guestType : null,
      targetRate: typeof b.targetRate === "number" ? b.targetRate : null,
      targetRateRequired: b.targetRateRequired === true,
      notes: typeof b.notes === "string" ? b.notes : null,
      nights: (b.nights as Record<string, unknown>[]).map((n) => ({
        roomType: typeof n.roomType === "string" ? n.roomType : null,
        night: String(n.night),
        rooms: Number(n.rooms),
      })),
    };
  });
}

const rfpProps = {
  title: { type: "string" },
  status: { type: "string", enum: ["DRAFT", "ISSUED", "CLOSED"] },
  responseDue: { type: ["string", "null"], description: "YYYY-MM-DD." },
  decisionBy: { type: ["string", "null"], description: "YYYY-MM-DD." },
  sections: {
    type: "array",
    items: { type: "string", enum: RFP_SECTIONS.map((s) => s.key) },
    description:
      "Optional document parts. Hotel RFPs: blocks (guest rooms), meetingSpace (function space rows), fb (F&B rows + minimum), concessions, history, requirements (other requirements), responseForm (blank tables the hotel fills in). Vendor RFPs: lineItems, concessions (printed as Terms), requirements, responseForm (pricing and terms to fill in). Contact, event profile, dates and proposal specifications always print.",
  },
  service: { type: ["string", "null"], description: "kind OTHER only: what it's for — an rfp_service option label (Transportation, DMC, Security…)." },
  introduction: { type: ["string", "null"], description: "Statement of need. HTML (paragraphs, lists, bold/italic)." },
  requirements: { type: ["string", "null"], description: "Other requirements. HTML." },
  contactId: { type: ["string", "null"], description: "Our point of contact — a contact id, usually one of the event's key staff." },
  arrivalDate: { type: ["string", "null"], description: "Requested arrival, YYYY-MM-DD. With departureDate, the default nights of new block grids." },
  departureDate: { type: ["string", "null"], description: "Requested departure, YYYY-MM-DD." },
  datesFlexible: { type: "boolean" },
  dateNotes: { type: ["string", "null"] },
  alternateDates: {
    type: "array",
    description: "Up to three alternate arrival/departure pairs; replaces the list.",
    items: { type: "object", properties: { startDate: { type: "string" }, endDate: { type: "string" } }, required: ["startDate", "endDate"] },
  },
  peakRooms: { type: ["integer", "null"], description: "Rooms on the peak night; the default rooms per night in a new block grid." },
  historyMatching: { type: "boolean", description: "Event history shows only past blocks of this RFP's contract / guest types (default: all blocks)." },
  reservationMethod: { type: ["string", "null"], description: "reservation_method option label." },
  commissionNotes: { type: ["string", "null"], description: "Rebates, assessments or commissions on room rates." },
  fbMinimum: { type: ["number", "null"] },
  fbIncludes: { type: "array", items: { type: "string", enum: ["TAX", "SERVICE", "GRATUITY"] }, description: "What the F&B minimum includes." },
  fbHistoricalSpend: { type: ["number", "null"] },
  amenities: { type: "array", items: { type: "string" }, description: "Requested amenities: hotel_amenity option labels." },
  decisionMakerId: { type: ["string", "null"], description: "Final decision maker as a contact id (usually key staff). Clears decisionMaker." },
  decisionMaker: { type: ["string", "null"], description: "Final decision maker typed in (name & role), when not a contact." },
  regions: { type: "array", items: { type: "string" }, description: "hotel_region labels this RFP targets (every area in them)." },
  areas: { type: "array", items: { type: "string" }, description: "hotel_area labels this RFP targets. With regions also empty, the event's areas apply." },
  siteVisitBy: { type: ["string", "null"], description: "YYYY-MM-DD." },
} as const;

function partialNumber(args: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${key} must be a number`);
  return v;
}

function alternateList(args: Record<string, unknown>): { startDate: string; endDate: string }[] | undefined {
  if (!("alternateDates" in args)) return undefined;
  const v = args.alternateDates;
  if (!Array.isArray(v)) throw new Error("alternateDates must be a list");
  return v.map((a: Record<string, unknown>) => ({ startDate: String(a.startDate ?? ""), endDate: String(a.endDate ?? "") }));
}

function mergeRfp(current: RfpWriteArgs, args: Record<string, unknown>): RfpWriteArgs {
  const status = partialString(args, "status");
  if (status && !STATUSES.has(status)) throw new Error("status must be DRAFT, ISSUED or CLOSED");
  const pick = <T>(v: T | undefined, cur: T) => (v === undefined ? cur : v);
  return {
    title: pick(partialString(args, "title") ?? undefined, current.title),
    status: pick((status ?? undefined) as RfpStatus | undefined, current.status),
    responseDue: pick(dateArg(args, "responseDue"), current.responseDue),
    decisionBy: pick(dateArg(args, "decisionBy"), current.decisionBy),
    sections: pick(stringList(args, "sections"), current.sections),
    introduction: pick(partialString(args, "introduction"), current.introduction),
    requirements: pick(partialString(args, "requirements"), current.requirements),
    contactId: pick(partialString(args, "contactId"), current.contactId),
    arrivalDate: pick(dateArg(args, "arrivalDate"), current.arrivalDate),
    departureDate: pick(dateArg(args, "departureDate"), current.departureDate),
    datesFlexible: pick(partialBoolean(args, "datesFlexible") ?? undefined, current.datesFlexible),
    dateNotes: pick(partialString(args, "dateNotes"), current.dateNotes),
    alternateDates: pick(alternateList(args), current.alternateDates),
    peakRooms: pick(partialInt(args, "peakRooms"), current.peakRooms),
    historyMatching: pick(partialBoolean(args, "historyMatching") ?? undefined, current.historyMatching),
    reservationMethod: pick(partialString(args, "reservationMethod"), current.reservationMethod),
    commissionNotes: pick(partialString(args, "commissionNotes"), current.commissionNotes),
    fbMinimum: pick(partialNumber(args, "fbMinimum"), current.fbMinimum),
    fbIncludes: pick(stringList(args, "fbIncludes"), current.fbIncludes),
    fbHistoricalSpend: pick(partialNumber(args, "fbHistoricalSpend"), current.fbHistoricalSpend),
    amenities: pick(stringList(args, "amenities"), current.amenities),
    decisionMakerId: pick(partialString(args, "decisionMakerId"), current.decisionMakerId),
    decisionMaker: pick(partialString(args, "decisionMaker"), current.decisionMaker),
    regions: pick(stringList(args, "regions"), current.regions),
    areas: pick(stringList(args, "areas"), current.areas),
    siteVisitBy: pick(dateArg(args, "siteVisitBy"), current.siteVisitBy),
    // Undefined leaves it as it is.
    service: partialString(args, "service"),
  };
}

const recipientInclude = { venue: { select: { id: true, name: true, city: true, state: true } }, vendor: { select: { id: true, name: true } } } as const;

// A recipient's responses: a hotel's proposals, a vendor's quotes.
const responsesOf = (
  r: { venueId: string | null; vendorId: string | null },
  proposals: { venueId: string }[],
  quotes: { vendorId: string }[],
) => (r.venueId ? proposals.filter((p) => p.venueId === r.venueId).length : quotes.filter((q) => q.vendorId === r.vendorId).length);

// The RFP kinds whose permission resource the user can view on this event.
async function viewableKinds(userId: string, eventId: string): Promise<RfpKind[]> {
  const kinds: RfpKind[] = ["HOTEL", ...VENDOR_RFP_KINDS];
  const allowed = await Promise.all(kinds.map((k) => hasPermissionForUser(userId, resourceForKind(k), "VIEW", eventId)));
  return kinds.filter((_, i) => allowed[i]);
}

const lineItemSchema = {
  type: "object",
  properties: {
    id: { type: ["string", "null"], description: "An existing line's id (get_rfp) to keep it and the quote lines answering it; omit for a new line." },
    group: { type: ["string", "null"], description: "Heading it prints under (the source order's name when copied)." },
    description: { type: "string" },
    quantity: { type: ["integer", "null"] },
    unit: { type: ["string", "null"], description: "each, day, hour, guests…" },
    day: { type: ["string", "null"], description: "YYYY-MM-DD, event-local." },
    endDay: { type: ["string", "null"], description: "Through this day, YYYY-MM-DD." },
    startTime: { type: ["string", "null"], description: "HH:MM, event-local." },
    endTime: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    avOrderId: { type: ["string", "null"] },
    cateringOrderId: { type: ["string", "null"] },
    printOrderId: { type: ["string", "null"] },
    equipmentItemId: { type: ["string", "null"] },
    printItemId: { type: ["string", "null"] },
    cateringLineItemId: { type: ["string", "null"] },
  },
  required: ["description"],
} as const;

function readLineItems(v: unknown): RfpLineItemArgs[] {
  if (!Array.isArray(v)) throw new Error("lineItems must be a list");
  const s = (x: unknown) => (typeof x === "string" && x ? x : null);
  return v.map((r: Record<string, unknown>) => ({
    id: s(r.id),
    group: s(r.group),
    description: String(r.description ?? ""),
    quantity: typeof r.quantity === "number" ? r.quantity : null,
    unit: s(r.unit),
    day: s(r.day),
    endDay: s(r.endDay),
    startTime: s(r.startTime),
    endTime: s(r.endTime),
    notes: s(r.notes),
    avOrderId: s(r.avOrderId),
    cateringOrderId: s(r.cateringOrderId),
    printOrderId: s(r.printOrderId),
    equipmentItemId: s(r.equipmentItemId),
    printItemId: s(r.printItemId),
    cateringLineItemId: s(r.cateringLineItemId),
  }));
}

export const rfpTools: McpToolDefinition[] = [
  {
    name: "list_rfps",
    description:
      "List an event's RFPs — hotel (kind HOTEL) and vendor (AV, CATERING, PRINT, OTHER): kind, service, title, status, response due date, issue date, requested block types (hotel), and recipient counts by state. Only kinds the caller may view. Returns summary shape — use `get_rfp` for full detail (requested nights or line items, concessions / terms, recipients, linked proposals or quotes).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
      const rfps = await prisma.rfp.findMany({
        where: { eventId, kind: { in: await viewableKinds(userId, eventId) } },
        select: {
          id: true,
          kind: true,
          service: true,
          title: true,
          status: true,
          responseDue: true,
          issuedOn: true,
          hotelBlocks: { select: { id: true, contractType: true, guestType: true }, orderBy: { sortOrder: "asc" } },
          recipients: { select: { venueId: true, vendorId: true, sentOn: true, declinedToBid: true } },
          hotelProposals: { select: { venueId: true } },
          quotes: { select: { vendorId: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return rfps.map(({ recipients, hotelProposals, quotes, ...r }) => {
        const counts: Record<string, number> = {};
        for (const x of recipients) {
          const { state } = recipientState({ ...x, responses: responsesOf(x, hotelProposals, quotes) }, r.responseDue);
          counts[state] = (counts[state] ?? 0) + 1;
        }
        return { ...r, recipients: counts };
      });
    },
  },
  {
    name: "get_rfp",
    description:
      "Get one RFP: details (requested dates, alternates, peak rooms, F&B minimum, amenities, decision timeline, service), document parts, requested hotel blocks (room type × night rooms, target rate) or vendor line items (with the order / item each was copied from and awardedQuoteId, the accepted quote that won it; null = open), function-space rows, concessions (terms on vendor RFPs), recipients (hotel or vendor, sent date, declined, state: NOT_SENT / AWAITING / OVERDUE / DECLINED / RESPONDED), and the proposals or quotes linked to it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await rfpFor(id, eventId, userId, "VIEW");
      const rfp = await prisma.rfp.findFirstOrThrow({
        where: { id, eventId },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true } },
          hotelBlocks: { orderBy: { sortOrder: "asc" }, include: { nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] } } },
          concessions: { orderBy: { sortOrder: "asc" } },
          alternateDates: { orderBy: { sortOrder: "asc" } },
          spaceRequests: { orderBy: { sortOrder: "asc" } },
          recipients: { orderBy: { createdAt: "asc" }, include: recipientInclude },
          hotelProposals: { select: { id: true, status: true, revision: true, rfpBlockId: true, venueId: true, venue: { select: { id: true, name: true } } } },
          lineItems: { orderBy: { sortOrder: "asc" } },
          quotes: { select: { id: true, status: true, revision: true, vendorId: true, vendor: { select: { name: true } } } },
          files: { select: { id: true, fileName: true, fileType: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
      });
      return {
        ...rfp,
        recipients: rfp.recipients.map((r) => ({
          ...r,
          ...recipientState({ ...r, responses: responsesOf(r, rfp.hotelProposals, rfp.quotes) }, rfp.responseDue),
        })),
      };
    },
  },
  {
    name: "create_rfp",
    description:
      "Create an RFP for an event. kind HOTEL (default) goes to hotels; AV, CATERING, PRINT or OTHER (with service) go to vendors. title is required; sections defaults to every part of the kind. Hotel: blocks are the requested room blocks (see set_rfp_blocks), concessions via set_rfp_concessions, hotels via add_rfp_recipients. Vendor: line items via fill_rfp_line_items / set_rfp_line_items, terms via set_rfp_concessions (rfp_term labels), vendors via add_rfp_recipients (vendorIds).",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        kind: { type: "string", enum: ["HOTEL", ...VENDOR_RFP_KINDS] },
        ...rfpProps,
        blocks: { type: "array", items: blockSchema, description: "HOTEL only." },
      },
      required: ["eventId", "title"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const raw = partialString(args, "kind") ?? "HOTEL";
      if (raw !== "HOTEL" && !(VENDOR_RFP_KINDS as readonly string[]).includes(raw)) throw new Error("kind must be HOTEL, AV, CATERING, PRINT or OTHER");
      const kind = raw as RfpKind;
      if (kind !== "HOTEL" && "blocks" in args) throw new Error("Only a hotel RFP has room blocks");
      if (args.status === "ISSUED") throw new Error("Create the RFP as a draft, then issue it with issue_rfp");
      const blank: RfpWriteArgs = {
        title: "",
        status: "DRAFT",
        responseDue: null,
        decisionBy: null,
        sections: sectionsFor(kind).map((s) => s.key),
        introduction: null,
        requirements: null,
        contactId: null,
        arrivalDate: null,
        departureDate: null,
        datesFlexible: false,
        dateNotes: null,
        alternateDates: [],
        peakRooms: null,
        historyMatching: false,
        reservationMethod: null,
        commissionNotes: null,
        fbMinimum: null,
        fbIncludes: [],
        fbHistoricalSpend: null,
        amenities: [],
        decisionMakerId: null,
        decisionMaker: null,
        regions: [],
        areas: [],
        siteVisitBy: null,
      };
      return createRfpCore(requireString(args, "eventId"), kind, mergeRfp(blank, args), "blocks" in args ? readBlocks(args.blocks) : [], userId);
    },
  },
  {
    name: "update_rfp",
    description:
      "Update an RFP's details; omitted fields are unchanged, null clears. Blocks, concessions and recipients have their own tools. A draft is issued with issue_rfp, not by setting status ISSUED.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...rfpProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await rfpFor(id, eventId, userId, "WRITE");
      const r = await prisma.rfp.findFirstOrThrow({ where: { id, eventId }, include: { alternateDates: { orderBy: { sortOrder: "asc" } } } });
      const day = (d: Date | null) => (d ? dateKey(d) : null);
      const current: RfpWriteArgs = {
        title: r.title,
        status: r.status,
        responseDue: r.responseDue ? dateKey(r.responseDue) : null,
        decisionBy: r.decisionBy ? dateKey(r.decisionBy) : null,
        sections: r.sections,
        introduction: r.introduction,
        requirements: r.requirements,
        contactId: r.contactId,
        arrivalDate: day(r.arrivalDate),
        departureDate: day(r.departureDate),
        datesFlexible: r.datesFlexible,
        dateNotes: r.dateNotes,
        alternateDates: r.alternateDates.map((a) => ({ startDate: dateKey(a.startDate), endDate: dateKey(a.endDate) })),
        peakRooms: r.peakRooms,
        historyMatching: r.historyMatching,
        reservationMethod: r.reservationMethod,
        commissionNotes: r.commissionNotes,
        fbMinimum: r.fbMinimum == null ? null : Number(r.fbMinimum),
        fbIncludes: r.fbIncludes,
        fbHistoricalSpend: r.fbHistoricalSpend == null ? null : Number(r.fbHistoricalSpend),
        amenities: r.amenities,
        decisionMakerId: r.decisionMakerId,
        decisionMaker: r.decisionMaker,
        regions: r.regions,
        areas: r.areas,
        siteVisitBy: day(r.siteVisitBy),
      };
      const next = mergeRfp(current, args);
      // Issuing files the document and stamps the sent dates.
      if (current.status === "DRAFT" && next.status === "ISSUED") throw new Error("Use issue_rfp to issue a draft RFP");
      return updateRfpCore(id, eventId, next, userId);
    },
  },
  {
    name: "issue_rfp",
    description:
      "Issue an RFP, as the Issue button does: renders the RFP document (.docx), files it on the RFP, stamps today as the issue date, marks recipients not yet sent (and not declined) as sent today, and moves a DRAFT to ISSUED. Reissuing an issued RFP files a new copy and keeps each recipient's first sent date. Add recipients first (add_rfp_recipients). Needs FILES write on the event. Returns the RFP's status, issue date, the filed document and recipients' sent dates.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await rfpFor(id, eventId, userId, "WRITE");
      await requirePermissionForUser(userId, "FILES", "WRITE", eventId);
      const doc = await getRfpDocumentCore(id, eventId, userId);
      const { renderRfpDocx, rfpFileName } = await import("@/lib/rfp/renderDocx");
      await issueRfpCore(id, eventId, { fileName: rfpFileName(doc.meta.eventName, doc.meta.title), buffer: await renderRfpDocx(doc) }, userId);
      return prisma.rfp.findFirstOrThrow({
        where: { id, eventId },
        select: {
          id: true,
          status: true,
          issuedOn: true,
          files: { select: { id: true, fileName: true, fileType: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
          recipients: { select: { id: true, venueId: true, vendorId: true, sentOn: true, declinedToBid: true }, orderBy: { createdAt: "asc" } },
        },
      });
    },
  },
  {
    name: "delete_rfp",
    description: "Delete an RFP with its blocks, concessions, recipients and issued files. Linked proposals stay (their RFP link is cleared).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await deleteRfpCore(requireString(args, "id"), requireString(args, "eventId"), userId);
      return { ok: true };
    },
  },
  {
    name: "set_rfp_blocks",
    description:
      "Replace an RFP's requested hotel blocks with this list. Pass each existing block's id (from get_rfp) to keep it — and the proposals answering it — linked; blocks left out are removed.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, blocks: { type: "array", items: blockSchema } },
      required: ["id", "eventId", "blocks"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await saveRfpBlocksCore(requireString(args, "id"), requireString(args, "eventId"), readBlocks(args.blocks), userId);
      return { ok: true };
    },
  },
  {
    name: "set_rfp_space_requests",
    description:
      "Replace an RFP's function-space and F&B rows (the APEX function grid). Pass an existing row's id (get_rfp) to keep it. kind MEETING rows take functionType from function_type labels and setup from setup_type; FB rows take a meal_type label. functionId / cateringOrderId (list_functions / list_catering_orders) record which of this event's items a row came from.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "RFP id." },
        eventId: { type: "string" },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: ["string", "null"] },
              kind: { type: "string", enum: ["MEETING", "FB"] },
              functionId: { type: ["string", "null"] },
              cateringOrderId: { type: ["string", "null"] },
              day: { type: ["string", "null"], description: "YYYY-MM-DD; null when not scheduled yet." },
              endDay: { type: ["string", "null"], description: "YYYY-MM-DD: the row repeats daily through this day (or, with hold24, runs straight through)." },
              startTime: { type: ["string", "null"], description: "HH:MM, 24-hour, event-local." },
              endTime: { type: ["string", "null"] },
              functionType: { type: ["string", "null"] },
              name: { type: "string" },
              attendance: { type: ["integer", "null"] },
              setup: { type: ["string", "null"] },
              areaSqFt: { type: ["integer", "null"] },
              av: { type: ["string", "null"] },
              hold24: { type: "boolean" },
              room: { type: ["string", "null"] },
            },
            required: ["kind", "name"],
          },
        },
      },
      required: ["id", "eventId", "rows"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      if (!Array.isArray(args.rows)) throw new Error("rows must be a list");
      const str = (v: unknown) => (typeof v === "string" && v ? v : null);
      const int = (v: unknown) => (typeof v === "number" ? v : null);
      const rows = (args.rows as Record<string, unknown>[]).map(
        (r): RfpSpaceArgs => ({
          id: str(r.id),
          kind: r.kind === "FB" ? "FB" : r.kind === "MEETING" ? "MEETING" : (String(r.kind) as RfpSpaceArgs["kind"]),
          functionId: str(r.functionId),
          cateringOrderId: str(r.cateringOrderId),
          day: str(r.day),
          endDay: str(r.endDay),
          startTime: str(r.startTime),
          endTime: str(r.endTime),
          functionType: str(r.functionType),
          name: String(r.name ?? ""),
          attendance: int(r.attendance),
          setup: str(r.setup),
          areaSqFt: int(r.areaSqFt),
          av: str(r.av),
          hold24: r.hold24 === true,
          room: str(r.room),
        }),
      );
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await saveRfpSpaceCore(id, eventId, rows, userId);
      return prisma.rfpSpaceRequest.findMany({ where: { rfpId: id }, orderBy: { sortOrder: "asc" } });
    },
  },
  {
    name: "set_rfp_concessions",
    description:
      "Replace an RFP's concessions (hotel RFPs) or terms (vendor RFPs) with this list, in order. label is an rfp_concession option label on a hotel RFP, an rfp_term label on a vendor RFP; value is what we ask for (\"1/40\", \"20%\", \"50% at signing\"). Pass existing ids (from get_rfp) to keep hotels' answers; concessions left out are removed with their answers.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        concessions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: ["string", "null"] },
              label: { type: "string" },
              value: { type: ["string", "null"] },
              required: { type: "boolean", description: "Must-have rather than nice-to-have." },
            },
            required: ["label"],
          },
        },
      },
      required: ["id", "eventId", "concessions"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      if (!Array.isArray(args.concessions)) throw new Error("concessions must be a list");
      const rows: RfpConcessionArgs[] = (args.concessions as Record<string, unknown>[]).map((c) => ({
        id: typeof c.id === "string" ? c.id : null,
        label: String(c.label ?? ""),
        value: typeof c.value === "string" ? c.value : null,
        required: c.required === true,
      }));
      await saveRfpConcessionsCore(requireString(args, "id"), requireString(args, "eventId"), rows, userId);
      return { ok: true };
    },
  },
  {
    name: "add_rfp_recipients",
    description:
      "Add recipients to an RFP: hotels (venueIds; list_venues — usually ones flagged isLodging) to a hotel RFP, vendors (vendorIds; list_vendors) to a vendor RFP. Ones already on it are skipped.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        venueIds: { type: "array", items: { type: "string" } },
        vendorIds: { type: "array", items: { type: "string" } },
      },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      const venueIds = stringList(args, "venueIds") ?? [];
      const vendorIds = stringList(args, "vendorIds") ?? [];
      if (venueIds.length) await addRfpRecipientsCore(id, eventId, venueIds, userId);
      if (vendorIds.length) await addRfpVendorRecipientsCore(id, eventId, vendorIds, userId);
      return { ok: true };
    },
  },
  {
    name: "update_rfp_recipient",
    description: "Set when an RFP went to a hotel, or that it declined to bid. Omitted fields are unchanged; null clears.",
    inputSchema: {
      type: "object",
      properties: {
        recipientId: { type: "string", description: "From get_rfp recipients." },
        id: { type: "string", description: "The RFP id." },
        eventId: { type: "string" },
        sentOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
        declinedToBid: { type: "boolean" },
        notes: { type: ["string", "null"] },
      },
      required: ["recipientId", "id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const recipientId = requireString(args, "recipientId");
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await rfpFor(id, eventId, userId, "WRITE");
      const r = await prisma.rfpRecipient.findFirst({ where: { id: recipientId, rfpId: id } });
      if (!r) throw new Error("Recipient not found");
      const sentOn = dateArg(args, "sentOn");
      const notes = partialString(args, "notes");
      await updateRfpRecipientCore(
        recipientId,
        id,
        eventId,
        {
          sentOn: sentOn === undefined ? (r.sentOn ? dateKey(r.sentOn) : null) : sentOn,
          declinedToBid: partialBoolean(args, "declinedToBid") ?? r.declinedToBid,
          notes: notes === undefined ? r.notes : notes,
        },
        userId,
      );
      return { ok: true };
    },
  },
  {
    name: "remove_rfp_recipient",
    description: "Take a hotel off an RFP's recipient list.",
    inputSchema: {
      type: "object",
      properties: { recipientId: { type: "string" }, id: { type: "string", description: "The RFP id." }, eventId: { type: "string" } },
      required: ["recipientId", "id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await removeRfpRecipientCore(requireString(args, "recipientId"), requireString(args, "id"), requireString(args, "eventId"), userId);
      return { ok: true };
    },
  },
  {
    name: "record_rfp_response",
    description:
      "Record a hotel's proposal in answer to one requested RFP block. Starts from the block (stay dates, room grid, block type) and the first Pending proposal status; any proposal field given overrides it (nights with rates, attrition, guest and meeting space charges, function space answering the RFP's meeting space requests, F&B terms…). concessions answers the RFP's concessions (one the hotel's profile covers — an amenity of the same label, e.g. Complimentary Breakfast — starts MET unless answered or the offer's amenities say it's UNAVAILABLE); offeredConcessions lists ones it offers unasked (rfp_concession labels). The hotel is added to the RFP's recipients if it wasn't. Returns the new proposal; edit it later with update_hotel_proposal.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        rfpBlockId: { type: "string", description: "A requested block id from get_rfp." },
        venueId: { type: "string", description: "The responding hotel (venue id)." },
        status: { type: "string", description: "proposal_status option label; defaults to the first one in the PENDING stage." },
        submittedOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
        checkIn: { type: ["string", "null"], description: "YYYY-MM-DD; defaults to the block's first night." },
        checkOut: { type: ["string", "null"], description: "YYYY-MM-DD; defaults to the day after the block's last night." },
        nights: {
          type: "array",
          description: "The offered grid (replaces the requested one). Each { roomType, night, rooms, rate }.",
          items: { type: "object", properties: { roomType: { type: ["string", "null"] }, night: { type: "string" }, rooms: { type: ["integer", "null"] }, rate: { type: ["number", "null"] } }, required: ["night"] },
        },
        allowedAttrition: { type: ["number", "null"] },
        guaranteedRevenue: { type: ["number", "null"] },
        validUntil: { type: ["string", "null"], description: "The offer's deadline (rates good until / contract by), YYYY-MM-DD." },
        taxIncluded: { type: ["boolean", "null"], description: "Whether the quoted rates include taxes and fees; null when not stated." },
        amenities: {
          type: "array",
          description: "Amenities the offer states: { label (hotel_amenity), status CONFIRMED | UNAVAILABLE, note }.",
          items: {
            type: "object",
            properties: { label: { type: "string" }, status: { type: "string", enum: ["CONFIRMED", "UNAVAILABLE"] }, note: { type: ["string", "null"] } },
            required: ["label", "status"],
          },
        },
        notes: { type: ["string", "null"] },
        charges: {
          type: "array",
          description: "Guest charges (resort fee, parking, breakfast).",
          items: chargeSchema,
        },
        ...proposalSpaceProps,
        concessions: {
          type: "array",
          items: {
            type: "object",
            properties: { concessionId: { type: "string" }, met: { type: ["string", "null"], enum: ["MET", "PARTIAL", "NOT_MET", null] }, offered: { type: ["string", "null"] } },
            required: ["concessionId"],
          },
        },
        offeredConcessions: {
          type: "array",
          description: "Concessions the hotel offers that the RFP didn't ask for: label (an rfp_concession option label) and offered terms.",
          items: { type: "object", properties: { label: { type: "string" }, offered: { type: ["string", "null"] } }, required: ["label"] },
        },
      },
      required: ["eventId", "rfpBlockId", "venueId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
      checkProposalExtras({ ...args, meetingCharges: [...((args.charges as unknown[]) ?? []), ...((args.meetingCharges as unknown[]) ?? [])] });
      await nameRequestedSpaces(args);
      const block = await prisma.rfpHotelBlock.findFirst({
        where: { id: requireString(args, "rfpBlockId"), rfp: { eventId } },
        include: {
          nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
          rfp: { select: { event: { select: { tenantId: true } }, concessions: { select: { id: true, label: true } } } },
        },
      });
      if (!block) throw new Error("RFP block not found");
      const pending = await prisma.customOption.findFirst({
        where: { tenantId: block.rfp.event.tenantId, category: "proposal_status", group: "PENDING" },
        orderBy: { sortOrder: "asc" },
        select: { label: true },
      });
      const keys = block.nights.map((n) => dateKey(n.night));
      const dayAfter = (k: string) => dateKey(new Date(new Date(`${k}T00:00:00Z`).getTime() + 86_400_000));
      const str = (k: string) => partialString(args, k);
      for (const k of ["submittedOn", "checkIn", "checkOut"]) dateArg(args, k);
      const concessions = Array.isArray(args.concessions)
        ? (args.concessions as Record<string, unknown>[]).map((c): ProposalConcessionArgs => {
            if (c.met != null && !MET.has(String(c.met))) throw new Error("met must be MET, PARTIAL or NOT_MET");
            return { concessionId: String(c.concessionId), met: (c.met ?? null) as ProposalConcessionArgs["met"], offered: typeof c.offered === "string" ? c.offered : null };
          })
        : undefined;
      // Requested concessions the hotel's profile covers start Met, as in the
      // web form: unless answered, or the offer says the amenity is unavailable.
      const venueId = requireString(args, "venueId");
      const amenities = readProposalAmenities(args.amenities) ?? [];
      const venue = await prisma.venue.findFirst({ where: { id: venueId, tenantId: block.rfp.event.tenantId }, select: { amenities: true } });
      const unavailable = new Set(amenities.filter((a) => a.status === "UNAVAILABLE").map((a) => labelKey(a.label)));
      const covered = coveredByProfile((venue?.amenities ?? []).filter((a) => !unavailable.has(labelKey(a))));
      const answered = new Set((concessions ?? []).filter((c) => c.met || c.offered?.trim()).map((c) => c.concessionId));
      const profileMet = block.rfp.concessions
        .filter((c) => !answered.has(c.id) && covered(c.label))
        .map((c): ProposalConcessionArgs => ({ concessionId: c.id, met: "MET", offered: null }));
      const proposal: ProposalWriteArgs = {
        venueId,
        status: str("status") ?? pending?.label ?? "",
        leadSourceDirect: false,
        leadSourceVendorId: null,
        leadSourceContactId: null,
        contractType: block.contractType,
        guestType: block.guestType,
        submittedOn: str("submittedOn") ?? null,
        checkIn: str("checkIn") ?? keys[0] ?? null,
        checkOut: str("checkOut") ?? (keys.length ? dayAfter(keys[keys.length - 1]) : null),
        declinedReason: null,
        notes: str("notes") ?? null,
        revision: 1,
        revisionSummary: null,
        allowedAttrition: typeof args.allowedAttrition === "number" ? args.allowedAttrition : null,
        guaranteedRevenue: typeof args.guaranteedRevenue === "number" ? args.guaranteedRevenue : null,
        validUntil: str("validUntil") ?? null,
        taxIncluded: typeof args.taxIncluded === "boolean" ? args.taxIncluded : null,
        amenities,
        nights: Array.isArray(args.nights)
          ? (args.nights as Record<string, unknown>[]).map((n) => ({
              roomType: typeof n.roomType === "string" ? n.roomType : null,
              night: String(n.night),
              rooms: typeof n.rooms === "number" ? n.rooms : null,
              rate: typeof n.rate === "number" ? n.rate : null,
            }))
          : block.nights.map((n) => ({ roomType: n.roomType, night: dateKey(n.night), rooms: n.rooms, rate: null })),
        charges: (args.charges as ProposalWriteArgs["charges"] | undefined) ?? [],
        meetingCharges: args.meetingCharges as ProposalWriteArgs["meetingCharges"],
        spaces: args.spaces as ProposalWriteArgs["spaces"],
        fbMinimum: typeof args.fbMinimum === "number" ? args.fbMinimum : null,
        fbMinimumScope: (args.fbMinimumScope ?? null) as ProposalWriteArgs["fbMinimumScope"],
        fbMinimumNote: str("fbMinimumNote") ?? null,
        fbTaxRate: typeof args.fbTaxRate === "number" ? args.fbTaxRate : null,
        fbServiceCharge: typeof args.fbServiceCharge === "number" ? args.fbServiceCharge : null,
        meals: args.meals as ProposalWriteArgs["meals"],
        rfpBlockId: block.id,
        concessions: concessions || profileMet.length ? [...(concessions ?? []), ...profileMet] : undefined,
        offeredConcessions: Array.isArray(args.offeredConcessions)
          ? (args.offeredConcessions as Record<string, unknown>[]).map((c) => ({ label: String(c.label ?? ""), offered: typeof c.offered === "string" ? c.offered : null }))
          : undefined,
      };
      return createHotelProposalCore(eventId, proposal, userId);
    },
  },
  {
    name: "get_rfp_comparison",
    description:
      "Compare the responses to an RFP. Hotel RFP: per requested block, each hotel's room nights and peak vs requested, nightly shortfall, weighted average rate vs target, room revenue, attrition, guaranteed revenue, validity, charges, amenities and concession answers (met / partial / not met). Vendor RFP: each quote's price per line item (missing: not quoted or fewer than asked; awarded: the quote won the line), each line's lineItemId and awardedQuoteId (null = open), lines won per quote, how many lines are awarded, extras, subtotal, fees, total, deposit, validity, and the lowest total.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      const { kind } = await rfpFor(id, eventId, userId, "VIEW");
      return kind === "HOTEL" ? getRfpComparisonCore(id, eventId, userId) : getQuoteComparisonCore(id, eventId, userId);
    },
  },
  {
    name: "set_rfp_line_items",
    description:
      "Replace a vendor RFP's line items with this list, in order. Pass existing ids (from get_rfp) to keep quote lines answering them; lines left out are removed (quote lines keep their price, unlinked). A line copied from an order keeps its source ids; use fill_rfp_line_items to copy from orders.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, lineItems: { type: "array", items: lineItemSchema } },
      required: ["id", "eventId", "lineItems"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await saveRfpLineItemsCore(id, eventId, readLineItems(args.lineItems), userId);
      return prisma.rfpLineItem.findMany({ where: { rfpId: id }, orderBy: { sortOrder: "asc" } });
    },
  },
  {
    name: "fill_rfp_line_items",
    description:
      "Copy line items into a vendor RFP from the event's orders of its kind — AV orders' equipment, catering orders' meals and line items, print orders' items — appended after the existing lines. Items already copied are skipped. orderIds limits it to those orders (list_av_orders / list_catering_orders / list_print_orders). OTHER RFPs have no orders: use set_rfp_line_items.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, orderIds: { type: "array", items: { type: "string" } } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      const only = stringList(args, "orderIds");
      const [candidates, current] = await Promise.all([
        rfpLineItemCandidatesCore(id, eventId, userId),
        prisma.rfpLineItem.findMany({ where: { rfpId: id }, orderBy: { sortOrder: "asc" } }),
      ]);
      const key = (r: Pick<LineItemRow, "equipmentItemId" | "printItemId" | "cateringLineItemId" | "cateringOrderId">) =>
        r.equipmentItemId ?? r.printItemId ?? r.cateringLineItemId ?? (r.cateringOrderId ? `meal:${r.cateringOrderId}` : null);
      const have = new Set(current.map(key).filter(Boolean));
      const added = candidates.filter((c) => !have.has(key(c)) && (!only || only.includes(sourceOrderId(c) ?? "")));
      const day = (d: Date | null) => (d ? dateKey(d) : null);
      await saveRfpLineItemsCore(id, eventId, [...current.map((r) => ({ ...r, day: day(r.day), endDay: day(r.endDay) })), ...added], userId);
      return { added: added.length, lineItems: await prisma.rfpLineItem.findMany({ where: { rfpId: id }, orderBy: { sortOrder: "asc" } }) };
    },
  },
];
