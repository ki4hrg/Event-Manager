import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PermissionError } from "@/lib/permissions";
import { makeMember, makeTenant, makeUser } from "../../../test/fixtures";
import { removeEventStaffCore } from "./[id]/staff/core";
import { savePickupCountsCore } from "./hotels/blockCore";
import { unlinkMediaDeliverableFromFunction } from "./media-deliverables/actions";
import { createFormLinkCore, revokeFormLinkCore, type CreateFormLinkArgs } from "./forms/core";
import { unlinkSupplyOrderFromFunctionCore } from "./supply-orders/core";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// A Server Action's arguments come from the client unchecked; an object where
// an id belongs is a Prisma filter. Each of these used to match every row.
const FILTER = { not: "" } as never;

async function event(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, grants, PermissionScope.UNASSIGNED);
  const ev = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { tenantId: tenant.id, userId: user.id, eventId: ev.id };
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("ids that are filter objects read as not found", () => {
  it("removeEventStaffCore leaves the event's staff alone", async () => {
    const { userId, eventId } = await event({ [PermissionResource.EVENTS]: PermissionLevel.WRITE });
    const staff = await makeUser();
    await prisma.eventStaff.create({ data: { eventId, userId: staff.id } });
    await expect(removeEventStaffCore(FILTER, eventId, userId)).rejects.toBeInstanceOf(PermissionError);
    expect(await prisma.eventStaff.count({ where: { eventId } })).toBe(1);
  });

  it("savePickupCountsCore refuses before touching any block", async () => {
    const { tenantId, userId, eventId } = await event({ [PermissionResource.HOTELS]: PermissionLevel.WRITE });
    const venue = await prisma.venue.create({ data: { tenantId, name: "Hotel" } });
    const proposal = await prisma.hotelProposal.create({ data: { eventId, venueId: venue.id, status: "Pending" } });
    const block = await prisma.hotelBlock.create({ data: { proposalId: proposal.id } });
    await prisma.hotelPickupCount.create({ data: { blockId: block.id, night: new Date("2026-11-01"), rooms: 3 } });
    await expect(savePickupCountsCore(FILTER, eventId, [], userId)).rejects.toBeInstanceOf(PermissionError);
    expect(await prisma.hotelPickupCount.count({ where: { blockId: block.id } })).toBe(1);
  });

  it("unlinkMediaDeliverableFromFunction leaves the event's links alone", async () => {
    const { eventId } = await event({ [PermissionResource.MEDIA_DELIVERABLES]: PermissionLevel.WRITE });
    const fn = await prisma.function.create({ data: { eventId, name: "Keynote" } });
    const md = await prisma.mediaDeliverable.create({ data: { eventId, name: "Recording" } as never });
    await prisma.mediaDeliverableFunction.create({ data: { mediaDeliverableId: md.id, functionId: fn.id } });
    await expect(unlinkMediaDeliverableFromFunction(FILTER, FILTER, eventId)).rejects.toBeInstanceOf(PermissionError);
    expect(await prisma.mediaDeliverableFunction.count({ where: { mediaDeliverableId: md.id } })).toBe(1);
  });

  it("revokeFormLinkCore leaves the event's other links open", async () => {
    const { userId, eventId } = await event({ [PermissionResource.FORMS]: PermissionLevel.WRITE });
    const args = {
      eventId, formType: "ITEM_REQUEST", functionId: null, contactId: null, presentationId: null, boothGroupId: null,
      label: null, recipientName: null, recipientEmail: null, sections: [], intro: null, mediaUploadUrl: null,
      options: null, workflowTemplateId: null, dueAt: null, expiresAt: new Date(Date.now() + 86_400_000), maxSubmissions: null,
    } as CreateFormLinkArgs;
    await createFormLinkCore(args, userId);
    await createFormLinkCore(args, userId);
    await expect(revokeFormLinkCore(FILTER, eventId, userId)).rejects.toBeInstanceOf(PermissionError);
    expect(await prisma.formLink.count({ where: { eventId, revokedAt: null } })).toBe(2);
  });

  it("unlinkSupplyOrderFromFunctionCore leaves the event's links alone", async () => {
    const { userId, eventId } = await event({ [PermissionResource.SUPPLY_ORDERS]: PermissionLevel.WRITE });
    const fn = await prisma.function.create({ data: { eventId, name: "Lunch" } });
    const order = await prisma.supplyOrder.create({ data: { eventId, name: "Swag" } });
    await prisma.supplyOrderFunction.create({ data: { supplyOrderId: order.id, functionId: fn.id } });
    await expect(unlinkSupplyOrderFromFunctionCore(FILTER, FILTER, eventId, userId)).rejects.toBeInstanceOf(PermissionError);
    expect(await prisma.supplyOrderFunction.count({ where: { supplyOrderId: order.id } })).toBe(1);
  });
});
