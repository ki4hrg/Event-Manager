import { parseContractTypes } from "@/lib/hotels";
import type { OfferHotel } from "@/lib/inboundParse";
import type { HotelChargeScope } from "@prisma/client";
import type {
  ProposalAmenityArgs,
  ProposalChargeArgs,
  ProposalConcessionArgs,
  ProposalMealArgs,
  ProposalNightArgs,
  ProposalOfferedConcessionArgs,
  ProposalSpaceArgs,
  ProposalWriteArgs,
} from "./core";

// ProposalForm's FormData → the proposal cores' args. Plain module: the
// hotels actions and the inbox (applying a proposal read from email) share it.

// ProposalForm's venueId for a hotel that isn't in Venues yet ("New hotel"):
// created on save from the newHotel.* fields.
export const NEW_HOTEL = "__new__";

// ProposalForm's lead-source value for a lead the hotel generated itself.
export const LEAD_SOURCE_DIRECT = "__direct__";

const NEW_HOTEL_KEYS = [
  "name",
  "address",
  "city",
  "state",
  "zip",
  "contactFirstName",
  "contactLastName",
  "contactTitle",
  "contactEmail",
  "contactPhone",
] as const satisfies readonly (keyof OfferHotel)[];

// The new hotel's inputs (named newHotel.<key>), on the proposal form and an
// RFP's recipients.
export const NEW_HOTEL_FIELDS: { key: keyof OfferHotel; label: string; wide?: boolean; type?: string }[] = [
  { key: "name", label: "Hotel name *", wide: true },
  { key: "address", label: "Address", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "contactTitle", label: "Contact title" },
  { key: "contactFirstName", label: "Contact first name" },
  { key: "contactLastName", label: "Contact last name" },
  { key: "contactEmail", label: "Contact email", type: "email" },
  { key: "contactPhone", label: "Contact phone", type: "tel" },
];

// The new hotel's fields, when the form picked "New hotel"; else null.
export function readNewHotel(formData: FormData): OfferHotel | null {
  if (formData.get("venueId") !== NEW_HOTEL) return null;
  return Object.fromEntries(NEW_HOTEL_KEYS.map((k) => [k, (formData.get(`newHotel.${k}`) as string) || null])) as OfferHotel;
}

export function readJson<T>(formData: FormData, key: string): T[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a list`);
  return parsed as T[];
}

export function readProposal(formData: FormData): ProposalWriteArgs {
  const str = (k: string) => (formData.get(k) as string) || null;
  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : null);
  // Fields the form may leave out: absent leaves what the proposal has.
  const optional = <T>(k: string, read: (k: string) => T) => (formData.has(k) ? read(k) : undefined);
  return {
    venueId: formData.get("venueId") as string,
    status: formData.get("status") as string,
    // "" not set, LEAD_SOURCE_DIRECT, or a lead-source vendor's id.
    leadSourceDirect: formData.get("leadSource") === LEAD_SOURCE_DIRECT,
    leadSourceVendorId: formData.get("leadSource") === LEAD_SOURCE_DIRECT ? null : str("leadSource"),
    leadSourceContactId: str("leadSourceContactId"),
    contractType: parseContractTypes(str("contractType") ?? undefined)[0] ?? null,
    guestType: str("guestType"),
    submittedOn: str("submittedOn"),
    checkIn: str("checkIn"),
    checkOut: str("checkOut"),
    declinedReason: str("declinedReason"),
    notes: str("notes"),
    revision: formData.get("revision") ? parseInt(formData.get("revision") as string) : 1,
    revisionSummary: str("revisionSummary"),
    allowedAttrition: num("allowedAttrition"),
    guaranteedRevenue: num("guaranteedRevenue"),
    validUntil: str("validUntil"),
    // "true" / "false"; blank = not stated.
    taxIncluded: formData.get("taxIncluded") === "true" ? true : formData.get("taxIncluded") === "false" ? false : null,
    amenities: readJson<ProposalAmenityArgs>(formData, "amenities"),
    nights: readJson<ProposalNightArgs>(formData, "nights"),
    charges: readJson<ProposalChargeArgs>(formData, "charges"),
    meetingCharges: optional("meetingCharges", (k) => readJson<ProposalChargeArgs>(formData, k)),
    spaces: optional("spaces", (k) => readJson<ProposalSpaceArgs>(formData, k)),
    fbMinimum: optional("fbMinimum", num),
    fbMinimumScope: optional("fbMinimumScope", (k) => (str(k) as HotelChargeScope | null)),
    fbMinimumNote: optional("fbMinimumNote", str),
    fbTaxRate: optional("fbTaxRate", num),
    fbServiceCharge: optional("fbServiceCharge", num),
    meals: optional("meals", (k) => readJson<ProposalMealArgs>(formData, k)),
    // The form also posts the link it shows as saved: an untouched picker
    // leaves the link alone, so a form loaded before a link made elsewhere
    // can't undo it.
    rfpBlockId: formData.has("rfpBlockId") && formData.get("rfpBlockId") !== formData.get("rfpBlockWas") ? str("rfpBlockId") : undefined,
    concessions: formData.has("concessions") ? readJson<ProposalConcessionArgs>(formData, "concessions") : undefined,
    offeredConcessions: formData.has("offeredConcessions") ? readJson<ProposalOfferedConcessionArgs>(formData, "offeredConcessions") : undefined,
  };
}

