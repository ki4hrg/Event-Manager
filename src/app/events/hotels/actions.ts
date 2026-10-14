"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HotelBlockType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  createHotelProposalCore,
  deleteHotelProposalCore,
  updateHotelProposalCore,
  type ProposalChargeArgs,
  type ProposalNightArgs,
  type ProposalWriteArgs,
} from "./core";

const listInclude = {
  venue: { select: { id: true, name: true, city: true, state: true, brand: true } },
  nights: { select: { night: true, roomType: true, rooms: true, rate: true } },
  _count: { select: { files: true } },
} as const;

export async function getHotelProposals(eventId: string) {
  await requirePermission("HOTELS", "VIEW", eventId);
  return prisma.hotelProposal.findMany({
    where: { eventId },
    include: listInclude,
    orderBy: [{ venue: { name: "asc" } }, { createdAt: "asc" }],
  });
}

export async function getHotelProposal(id: string, eventId: string) {
  await requirePermission("HOTELS", "VIEW", eventId);
  return prisma.hotelProposal.findFirst({
    where: { id, eventId },
    include: {
      venue: { select: { id: true, name: true, city: true, state: true, brand: true, area: true } },
      nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
      charges: { orderBy: { sortOrder: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      versions: {
        orderBy: { revision: "desc" },
        include: { createdBy: { select: { name: true, email: true } } },
      },
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

// Dropdown sources for ProposalForm. Lodging venues first; any venue may be
// picked, since a hotel is sometimes added before it is flagged as lodging.
export async function getProposalFormChoices(eventId: string) {
  const session = await requirePermission("HOTELS", "VIEW", eventId);
  const tenantId = session.tenantId;
  const [venues, options] = await Promise.all([
    prisma.venue.findMany({
      where: { tenantId },
      select: { id: true, name: true, city: true, state: true, isLodging: true },
      orderBy: { name: "asc" },
    }),
    prisma.customOption.findMany({
      where: { tenantId, category: { in: ["proposal_status", "hotel_room_type", "hotel_amenity", "hotel_lead_source"] } },
      select: { category: true, label: true, group: true, color: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const of = (category: string) => options.filter((o) => o.category === category);
  return {
    venues: [...venues.filter((v) => v.isLodging), ...venues.filter((v) => !v.isLodging)].map((v) => ({
      id: v.id,
      label: [v.name, [v.city, v.state].filter(Boolean).join(", ")].filter(Boolean).join(" — "),
      isLodging: v.isLodging,
    })),
    statuses: of("proposal_status").map((o) => ({ label: o.label, group: o.group, color: o.color })),
    roomTypes: of("hotel_room_type").map((o) => o.label),
    amenities: of("hotel_amenity").map((o) => o.label),
    leadSources: of("hotel_lead_source").map((o) => o.label),
  };
}

function readJson<T>(formData: FormData, key: string): T[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a list`);
  return parsed as T[];
}

function readProposal(formData: FormData): ProposalWriteArgs {
  const str = (k: string) => (formData.get(k) as string) || null;
  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : null);
  return {
    venueId: formData.get("venueId") as string,
    status: formData.get("status") as string,
    leadSource: str("leadSource"),
    blockType: str("blockType") as HotelBlockType | null,
    submittedOn: str("submittedOn"),
    checkIn: str("checkIn"),
    checkOut: str("checkOut"),
    declinedReason: str("declinedReason"),
    notes: str("notes"),
    revision: formData.get("revision") ? parseInt(formData.get("revision") as string) : 1,
    revisionSummary: str("revisionSummary"),
    isRunOfHouse: formData.get("isRunOfHouse") === "true",
    allowedAttrition: num("allowedAttrition"),
    guaranteedRevenue: num("guaranteedRevenue"),
    amenities: formData.getAll("amenities") as string[],
    nights: readJson<ProposalNightArgs>(formData, "nights"),
    charges: readJson<ProposalChargeArgs>(formData, "charges"),
  };
}

export async function createHotelProposal(eventId: string, formData: FormData) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const proposal = await createHotelProposalCore(eventId, readProposal(formData), session.user.id);
  revalidatePath(`/events/${eventId}/hotels`);
  redirect(`/events/${eventId}/hotels/proposals/${proposal.id}?success=Proposal created`);
}

export async function updateHotelProposal(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await updateHotelProposalCore(id, eventId, readProposal(formData), session.user.id);
  revalidatePath(`/events/${eventId}/hotels`);
  revalidatePath(`/events/${eventId}/hotels/proposals/${id}`);
  redirect(`/events/${eventId}/hotels/proposals/${id}?success=Proposal updated`);
}

export async function deleteHotelProposal(id: string, eventId: string) {
  const session = await requirePermission("HOTELS", "DELETE", eventId);
  await deleteHotelProposalCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/hotels`);
  redirect(`/events/${eventId}/hotels?success=Proposal deleted`);
}
