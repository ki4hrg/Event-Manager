// Exhibit Request: an open link for exhibitors to ask for a booth, optionally
// scoped to one booth group. Apply creates the booth, its contact (per the
// reviewer's choice) and its equipment. Server-only module.
//
// Writes only plain-text columns, booleans and the ProvidedBy enum.

import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { getOptionsForEvent } from "@/lib/options";
import { createContactCore } from "@/app/contacts/core";
import { createBoothEquipmentItemCore, createExhibitBoothCore } from "@/app/events/exhibits/core";
import { PublicFormError } from "./links";
import { contactReviewChoice, resolveContactChoice } from "./contacts";
import {
  EXHIBIT_MAX_EQUIPMENT,
  EXHIBIT_PROVIDERS,
  EXHIBIT_REQUEST_SECTION_KEYS,
  optionLabel,
  type ExhibitProvider,
  type ExhibitRequestBaseline,
  type ExhibitRequestPayload,
  type FormDiffRow,
  type FormDiffSection,
} from "./meta";
import type { FormApplyContext, FormModule } from "./types";

const NOTE_MAX = 2000;
const NAME_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, key: string, max: number): string | null {
  const raw = formData.get(key);
  if (raw == null) return null;
  if (typeof raw !== "string") throw new PublicFormError("invalid");
  const value = raw.trim();
  if (value.length > max) throw new PublicFormError("invalid");
  return value || null;
}

function provider(formData: FormData, key: string): ExhibitProvider | null {
  const value = text(formData, key, 20);
  if (value == null) return null;
  const hit = EXHIBIT_PROVIDERS.find((p) => p.value === value);
  if (!hit) throw new PublicFormError("invalid");
  return hit.value;
}

async function parseExhibitRequest(formData: FormData, baseline: ExhibitRequestBaseline): Promise<ExhibitRequestPayload> {
  let tooMany = false;
  formData.forEach((_, key) => {
    const m = /^equip_(\d+)_/.exec(key);
    if (m && parseInt(m[1], 10) >= EXHIBIT_MAX_EQUIPMENT) tooMany = true;
  });
  if (tooMany) throw new PublicFormError("invalid");

  const boothType = text(formData, "boothType", NAME_MAX);
  if (boothType !== null && !baseline.boothTypes.includes(boothType)) throw new PublicFormError("invalid");

  const firstName = text(formData, "contactFirstName", NAME_MAX);
  const lastName = text(formData, "contactLastName", NAME_MAX);
  const email = text(formData, "contactEmail", 200)?.toLowerCase() ?? null;
  const phone = text(formData, "contactPhone", 40);
  if (email && !EMAIL_RE.test(email)) throw new PublicFormError("invalid");
  if (!firstName && (lastName || email || phone)) throw new PublicFormError("invalid");

  const equipment: ExhibitRequestPayload["equipment"] = [];
  for (let i = 0; i < EXHIBIT_MAX_EQUIPMENT; i++) {
    const item = text(formData, `equip_${i}_item`, 200);
    if (!item) continue;
    const qty = text(formData, `equip_${i}_quantity`, 6);
    if (qty !== null && !/^\d+$/.test(qty)) throw new PublicFormError("invalid");
    equipment.push({ item, quantity: qty === null ? null : parseInt(qty, 10) });
  }

  return {
    company: text(formData, "company", NAME_MAX),
    boothType,
    location: text(formData, "location", 200),
    contact: firstName ? { firstName, lastName, email, phone } : null,
    shippingRequired: formData.get("shippingRequired") === "true",
    customsRequired: formData.get("customsRequired") === "true",
    electricalProvider: provider(formData, "electricalProvider"),
    electricalNotes: text(formData, "electricalNotes", NOTE_MAX),
    avProvider: provider(formData, "avProvider"),
    avNotes: text(formData, "avNotes", NOTE_MAX),
    specialRequirements: text(formData, "specialRequirements", NOTE_MAX),
    equipment,
  };
}

const row = (field: string, label: string, proposed: string | null): FormDiffRow => ({
  field,
  label,
  baseline: null,
  proposed,
  current: null,
  status: "changed",
});

function boothName(payload: ExhibitRequestPayload, submitterOrg: string | null) {
  return payload.company || submitterOrg || "Exhibit request";
}

function diffExhibitRequest(baseline: ExhibitRequestBaseline, payload: ExhibitRequestPayload): FormDiffSection[] {
  const yes = (v: boolean) => (v ? "Yes" : "No");
  const booth: FormDiffRow[] = [
    row("company", "Company", payload.company),
    row("group", "Group", baseline.groupName),
    row("boothType", "Booth type", payload.boothType),
    row("location", "Preferred location", payload.location),
    row("shippingRequired", "Shipping", yes(payload.shippingRequired)),
    row("customsRequired", "Customs", yes(payload.customsRequired)),
    row("electrical", "Electrical", [optionLabel(EXHIBIT_PROVIDERS, payload.electricalProvider), payload.electricalNotes].filter(Boolean).join(" — ") || null),
    row("av", "Audio visual", [optionLabel(EXHIBIT_PROVIDERS, payload.avProvider), payload.avNotes].filter(Boolean).join(" — ") || null),
    row("specialRequirements", "Special requirements", payload.specialRequirements),
  ].filter((r) => r.proposed != null);
  const sections: FormDiffSection[] = [
    { key: "booth", label: "Booth", mode: "create", verdict: null, note: null, rows: booth, applicable: true },
  ];
  if (payload.contact) {
    const c = payload.contact;
    sections.push({
      key: "contact",
      label: "Contact",
      mode: "create",
      verdict: null,
      note: null,
      rows: [row("contact", "Contact", [[c.firstName, c.lastName].filter(Boolean).join(" "), c.email, c.phone].filter(Boolean).join(" · "))],
      applicable: true,
    });
  }
  if (payload.equipment.length > 0) {
    sections.push({
      key: "equipment",
      label: "Equipment",
      mode: "create",
      verdict: null,
      note: null,
      rows: payload.equipment.map((e, i) => row(`equip-${i}`, "Item", e.quantity != null ? `${e.quantity} × ${e.item}` : e.item)),
      applicable: true,
    });
  }
  return sections;
}

async function applyExhibitRequest(ctx: FormApplyContext<ExhibitRequestPayload, ExhibitRequestBaseline>) {
  const { link, sections, userId } = ctx;
  const { payload } = ctx.submission;
  const eventId = link.eventId;
  // The contact and equipment hang off the booth.
  if (!sections.has("booth")) throw new Error("Apply the booth to add its contact and equipment");
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);

  let contactId: string | null = null;
  if (sections.has("contact") && payload.contact) {
    const choice = await resolveContactChoice(ctx.choices.contact, link.tenantId);
    if (choice.kind === "new") {
      const contact = await createContactCore(
        {
          firstName: payload.contact.firstName,
          lastName: payload.contact.lastName ?? "",
          email: payload.contact.email,
          phone: payload.contact.phone,
          organization: payload.company,
          notes: null,
          roles: [],
        },
        userId,
        link.tenantId,
      );
      contactId = contact.id;
    } else if (choice.kind === "existing") {
      contactId = choice.contactId;
    }
  }

  // A group deleted since the link was made leaves the booth ungrouped.
  const groupId = link.boothGroupId
    ? (await prisma.exhibitBoothGroup.findFirst({ where: { id: link.boothGroupId, eventId }, select: { id: true } }))?.id ?? null
    : null;
  const booth = await createExhibitBoothCore(
    eventId,
    {
      name: boothName(payload, ctx.submission.submitterOrg),
      companyName: payload.company,
      groupId,
      contactId,
      boothType: payload.boothType,
      location: payload.location,
      shippingRequired: payload.shippingRequired,
      customsRequired: payload.customsRequired,
      electricalProvider: payload.electricalProvider,
      electricalNotes: payload.electricalNotes,
      avProvider: payload.avProvider,
      avNotes: payload.avNotes,
      specialRequirements: payload.specialRequirements,
    },
    userId,
  );

  if (sections.has("equipment")) {
    for (const e of payload.equipment) {
      await createBoothEquipmentItemCore(
        { boothId: booth.id },
        eventId,
        {
          equipmentId: null,
          item: e.item,
          quantity: e.quantity,
          providerVendorId: null,
          providerContactId: null,
          operatorVendorId: null,
          operatorContactId: null,
          notes: null,
        },
        userId,
      );
    }
  }
  return { applied: ["booth", "contact", "equipment"].filter((k) => sections.has(k)), boothId: booth.id, contactId };
}

export const exhibitRequestModule: FormModule<ExhibitRequestPayload, ExhibitRequestBaseline> = {
  sectionKeys: EXHIBIT_REQUEST_SECTION_KEYS,
  open: true,
  externalUpload: false,
  async assertTarget({ eventId, boothGroupId }, userId) {
    await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", eventId);
    if (!boothGroupId) return;
    const group = await prisma.exhibitBoothGroup.findFirst({ where: { id: boothGroupId, eventId }, select: { id: true } });
    if (!group) throw new PermissionError("NOT_FOUND", "Booth group not found");
  },
  async snapshot(link) {
    const [group, boothTypes] = await Promise.all([
      link.boothGroupId
        ? prisma.exhibitBoothGroup.findFirst({ where: { id: link.boothGroupId, eventId: link.eventId }, select: { name: true } })
        : null,
      getOptionsForEvent(link.eventId, "booth_type"),
    ]);
    return {
      baseline: { groupName: group?.name ?? null, boothTypes: boothTypes.map((o) => o.label) },
      sections: ["booth"],
      version: "1",
      targetName: group?.name ?? link.event.name,
    };
  },
  parse: (formData, snapshot) => parseExhibitRequest(formData, snapshot.baseline),
  rebase: (payload) => payload,
  diff: (baseline, payload) => diffExhibitRequest(baseline, payload),
  async reviewChoices(payload, link) {
    if (!payload.contact) return [];
    return [await contactReviewChoice("contact", "Contact", payload.contact.email, link.tenantId)];
  },
  apply: applyExhibitRequest,
};
