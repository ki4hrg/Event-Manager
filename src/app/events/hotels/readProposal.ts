// ProposalForm's FormData → the proposal cores' args, with every JSON list
// checked against its schema. Server-only (it imports the hotel core); the
// client-safe constants the form shares live in ./proposalArgs.

import { HotelChargeScope } from "@prisma/client";
import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";
import { formId, formInt, formNote, formNumber, formRequiredId, formValue, readJsonList } from "@/lib/validation";
import {
  ProposalAmenitySchema,
  ProposalChargeSchema,
  ProposalConcessionSchema,
  ProposalMealSchema,
  ProposalNightSchema,
  ProposalOfferedConcessionSchema,
  ProposalSpaceSchema,
  type ProposalWriteArgs,
} from "./core";
import { LEAD_SOURCE_DIRECT } from "./proposalArgs";

const ScopeSchema = z.enum(HotelChargeScope);

// A charge scope select: blank is none; anything else must be a scope.
function scopeOrNull(v: FormDataEntryValue | null): HotelChargeScope | null {
  if (!v) return null;
  const parsed = ScopeSchema.safeParse(v);
  if (!parsed.success) throw new UserFacingError("Pick an F&B minimum scope from the list");
  return parsed.data;
}

export function readProposal(formData: FormData): ProposalWriteArgs {
  const str = (k: string) => formNote(formData, k);
  const num = (k: string) => formNumber(formData, k);
  // Fields the form may leave out: absent leaves what the proposal has.
  const optional = <T>(k: string, read: (k: string) => T) => (formData.has(k) ? read(k) : undefined);
  return {
    // A venue id, or NEW_HOTEL for one created on save.
    venueId: formRequiredId(formData, "venueId", "hotel"),
    status: formValue(formData, "status", 1_000),
    // "" not set, LEAD_SOURCE_DIRECT, or a lead-source vendor's id.
    leadSourceDirect: formData.get("leadSource") === LEAD_SOURCE_DIRECT,
    leadSourceVendorId: formData.get("leadSource") === LEAD_SOURCE_DIRECT ? null : formId(formData, "leadSource"),
    leadSourceContactId: formId(formData, "leadSourceContactId"),
    contractType: str("contractType"),
    guestType: str("guestType"),
    submittedOn: str("submittedOn"),
    checkIn: str("checkIn"),
    checkOut: str("checkOut"),
    declinedReason: str("declinedReason"),
    notes: str("notes"),
    revision: formInt(formData, "revision", { min: 1 }) ?? 1,
    revisionSummary: str("revisionSummary"),
    allowedAttrition: num("allowedAttrition"),
    guaranteedRevenue: num("guaranteedRevenue"),
    validUntil: str("validUntil"),
    // "true" / "false"; blank = not stated.
    taxIncluded: formData.get("taxIncluded") === "true" ? true : formData.get("taxIncluded") === "false" ? false : null,
    amenities: readJsonList(formData, "amenities", ProposalAmenitySchema),
    nights: readJsonList(formData, "nights", ProposalNightSchema),
    charges: readJsonList(formData, "charges", ProposalChargeSchema),
    meetingCharges: optional("meetingCharges", (k) => readJsonList(formData, k, ProposalChargeSchema)),
    spaces: optional("spaces", (k) => readJsonList(formData, k, ProposalSpaceSchema)),
    fbMinimum: optional("fbMinimum", num),
    fbMinimumScope: optional("fbMinimumScope", (k) => scopeOrNull(formData.get(k))),
    fbMinimumNote: optional("fbMinimumNote", str),
    fbTaxRate: optional("fbTaxRate", num),
    fbServiceCharge: optional("fbServiceCharge", num),
    meals: optional("meals", (k) => readJsonList(formData, k, ProposalMealSchema)),
    // The form also posts the link it shows as saved: an untouched picker
    // leaves the link alone, so a form loaded before a link made elsewhere
    // can't undo it.
    rfpBlockId: formData.has("rfpBlockId") && formData.get("rfpBlockId") !== formData.get("rfpBlockWas") ? formId(formData, "rfpBlockId") : undefined,
    concessions: formData.has("concessions") ? readJsonList(formData, "concessions", ProposalConcessionSchema) : undefined,
    offeredConcessions: formData.has("offeredConcessions") ? readJsonList(formData, "offeredConcessions", ProposalOfferedConcessionSchema) : undefined,
  };
}

