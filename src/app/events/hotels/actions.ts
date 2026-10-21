"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HotelChargeScope, HotelPickupMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  createHotelProposalCore,
  deleteHotelProposalCore,
  updateHotelProposalCore,
} from "./core";
import { readJson, readProposal } from "./proposalArgs";
import {
  clearPickupCore,
  createHotelBlockCore,
  deleteHotelBlockCore,
  importPickupGuestsCore,
  savePickupCountsCore,
  updateHotelBlockCore,
  type BlockNightArgs,
  type PickupCountArgs,
  type PickupGuestArgs,
} from "./blockCore";

const listInclude = {
  venue: { select: { id: true, name: true, city: true, state: true, brand: true } },
  nights: { select: { night: true, roomType: true, rooms: true, rate: true } },
  block: { select: { id: true } },
  rfp: { select: { id: true, title: true } },
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
      amenities: { orderBy: { sortOrder: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      versions: {
        orderBy: { revision: "desc" },
        include: { createdBy: { select: { name: true, email: true } } },
      },
      block: { select: { id: true } },
      rfp: { select: { id: true, title: true, concessions: { orderBy: { sortOrder: "asc" } } } },
      concessions: { orderBy: { sortOrder: "asc" } },
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
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        isLodging: true,
        amenities: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.customOption.findMany({
      where: { tenantId, category: { in: ["proposal_status", "hotel_room_type", "hotel_guest_type", "hotel_amenity", "hotel_lead_source", "hotel_area", "rfp_concession"] } },
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
      amenities: v.amenities,
    })),
    concessionOptions: of("rfp_concession").map((o) => ({ label: o.label, group: o.group })),
    statuses: of("proposal_status").map((o) => ({ label: o.label, group: o.group, color: o.color })),
    roomTypes: of("hotel_room_type").map((o) => o.label),
    guestTypes: of("hotel_guest_type").map((o) => o.label),
    amenities: of("hotel_amenity").map((o) => o.label),
    leadSources: of("hotel_lead_source").map((o) => o.label),
    areas: of("hotel_area").map((o) => ({ label: o.label, region: o.group })),
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

// ---------------------------------------------------------------------------
// Blocks

// What the pickup math needs (src/lib/hotelPickup.ts).
const pickupSelect = {
  nights: { orderBy: [{ night: "asc" as const }, { roomType: "asc" as const }] },
  pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
  pickupCounts: { select: { night: true, roomType: true, rooms: true } },
} satisfies Prisma.HotelBlockSelect;

export async function getHotelBlocks(eventId: string) {
  await requirePermission("HOTELS", "VIEW", eventId);
  return prisma.hotelBlock.findMany({
    where: { proposal: { eventId } },
    select: {
      id: true,
      isHq: true,
      checkIn: true,
      checkOut: true,
      cutoffDate: true,
      allowedAttrition: true,
      proposal: { select: { id: true, contractType: true, guestType: true, venue: { select: { id: true, name: true } } } },
      ...pickupSelect,
    },
    orderBy: [{ isHq: "desc" }, { proposal: { venue: { name: "asc" } } }],
  });
}

const GUEST_LIMIT = 500;

export async function getHotelBlock(blockId: string, eventId: string) {
  await requirePermission("HOTELS", "VIEW", eventId);
  const block = await prisma.hotelBlock.findFirst({
    where: { id: blockId, proposal: { eventId } },
    include: {
      proposal: { select: { id: true, contractType: true, guestType: true, revision: true, venue: { select: { id: true, name: true, city: true, state: true } } } },
      nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
      charges: { orderBy: { sortOrder: "asc" } },
      pickupCounts: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
      pickupImports: {
        orderBy: { createdAt: "desc" },
        include: { importedBy: { select: { name: true, email: true } } },
      },
      updatedBy: { select: { name: true, email: true } },
      _count: { select: { pickupGuests: true } },
    },
  });
  if (!block) return null;
  // The pickup math needs every guest; the list on the page shows the first GUEST_LIMIT.
  const guests = await prisma.hotelPickupGuest.findMany({
    where: { blockId },
    orderBy: [{ checkIn: "asc" }, { guestName: "asc" }],
  });
  return { ...block, pickupGuests: guests, guestLimit: GUEST_LIMIT };
}

export async function getBlockFormChoices(eventId: string) {
  const session = await requirePermission("HOTELS", "VIEW", eventId);
  const options = await prisma.customOption.findMany({
    where: { tenantId: session.tenantId, category: { in: ["hotel_room_type", "reservation_method"] } },
    select: { category: true, label: true },
    orderBy: { sortOrder: "asc" },
  });
  return {
    roomTypes: options.filter((o) => o.category === "hotel_room_type").map((o) => o.label),
    reservationMethods: options.filter((o) => o.category === "reservation_method").map((o) => o.label),
  };
}

export async function createHotelBlock(proposalId: string, eventId: string) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const block = await createHotelBlockCore(proposalId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/hotels`);
  redirect(`/events/${eventId}/hotels/blocks/${block.id}?success=Block created`);
}

export async function updateHotelBlock(blockId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const str = (k: string) => (formData.get(k) as string) || null;
  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : null);
  const int = (k: string) => (formData.get(k) ? parseInt(formData.get(k) as string) : null);
  await updateHotelBlockCore(
    blockId,
    eventId,
    {
      isHq: formData.get("isHq") === "true",
      checkIn: str("checkIn"),
      checkOut: str("checkOut"),
      reservationMethod: str("reservationMethod"),
      groupCode: str("groupCode"),
      bookingLink: str("bookingLink"),
      bookingPhone: str("bookingPhone"),
      cutoffDate: str("cutoffDate"),
      contractedOn: str("contractedOn"),
      cutoffExercised: formData.get("cutoffExercised") === "true" ? true : formData.get("cutoffExercised") === "false" ? false : null,
      allowedAttrition: num("allowedAttrition"),
      guaranteedRevenue: num("guaranteedRevenue"),
      distanceMiles: num("distanceMiles"),
      driveMinutes: int("driveMinutes"),
      compRooms: int("compRooms"),
      staffRooms: int("staffRooms"),
      notes: str("notes"),
      nights: readJson<BlockNightArgs>(formData, "nights"),
      charges: readJson<{ chargeType: string; amount: number | null; scope: HotelChargeScope | null }>(formData, "charges"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/hotels`);
  revalidatePath(`/events/${eventId}/hotels/blocks/${blockId}`);
  redirect(`/events/${eventId}/hotels/blocks/${blockId}?success=Block updated`);
}

export async function deleteHotelBlock(blockId: string, eventId: string) {
  const session = await requirePermission("HOTELS", "DELETE", eventId);
  await deleteHotelBlockCore(blockId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/hotels`);
  redirect(`/events/${eventId}/hotels?success=Block deleted`);
}

export async function importPickupGuests(
  blockId: string,
  eventId: string,
  method: Exclude<HotelPickupMethod, "COUNTS">,
  fileName: string | null,
  guests: PickupGuestArgs[],
) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await importPickupGuestsCore(blockId, eventId, { method, fileName, guests }, session.user.id);
  revalidatePath(`/events/${eventId}/hotels/blocks/${blockId}`);
}

export async function savePickupCounts(blockId: string, eventId: string, counts: PickupCountArgs[]) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await savePickupCountsCore(blockId, eventId, counts, session.user.id);
  revalidatePath(`/events/${eventId}/hotels/blocks/${blockId}`);
}

export async function clearPickup(blockId: string, eventId: string) {
  const session = await requirePermission("HOTELS", "DELETE", eventId);
  await clearPickupCore(blockId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/hotels/blocks/${blockId}`);
}
