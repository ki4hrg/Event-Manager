import type { OfferHotel } from "@/lib/inboundParse";

// ProposalForm's constants and the new-hotel fields, shared by the form, the
// hotels actions and the inbox. Client-safe: no server imports here; the
// FormData → args reader is ./readProposal.ts.

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
