import { parseContractTypes } from "@/lib/hotels";
import type { OfferHotel } from "@/lib/inboundParse";
import type { ProposalChargeArgs, ProposalConcessionArgs, ProposalNightArgs, ProposalOfferedConcessionArgs, ProposalAmenityArgs, ProposalWriteArgs } from "./core";

// ProposalForm's FormData → the proposal cores' args. Plain module: the
// hotels actions and the inbox (applying a proposal read from email) share it.

// ProposalForm's venueId for a hotel that isn't in Venues yet ("New hotel"):
// created on save from the newHotel.* fields.
export const NEW_HOTEL = "__new__";

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
  return {
    venueId: formData.get("venueId") as string,
    status: formData.get("status") as string,
    leadSource: str("leadSource"),
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
    rfpBlockId: str("rfpBlockId"),
    concessions: formData.has("concessions") ? readJson<ProposalConcessionArgs>(formData, "concessions") : undefined,
    offeredConcessions: formData.has("offeredConcessions") ? readJson<ProposalOfferedConcessionArgs>(formData, "offeredConcessions") : undefined,
  };
}

