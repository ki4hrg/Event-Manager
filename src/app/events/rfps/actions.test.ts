import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../../test/fixtures";
import { getRfpHistory, saveRfpConcessions, saveRfpLineItems, updateRfpRecipient } from "./actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function setup() {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, { [PermissionResource.AV_ORDERS]: PermissionLevel.WRITE }, PermissionScope.UNASSIGNED);
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  const rfp = await prisma.rfp.create({ data: { eventId: event.id, kind: "AV", title: "AV RFP" } });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { eventId: event.id, rfpId: rfp.id };
}

const line = {
  group: null,
  description: "Projector",
  quantity: 2,
  unit: "ea",
  day: null,
  endDay: null,
  startTime: null,
  endTime: null,
  notes: null,
  avOrderId: null,
  cateringOrderId: null,
  printOrderId: null,
  equipmentItemId: null,
  printItemId: null,
  cateringLineItemId: null,
};

beforeEach(() => vi.mocked(auth).mockReset());

describe("RFP actions: structured arguments from the page", () => {
  it("saves line items, reading NaN and missing optional text as none", async () => {
    const { eventId, rfpId } = await setup();
    const { notes: _notes, ...withoutNotes } = line;
    await saveRfpLineItems(rfpId, eventId, [{ ...withoutNotes, quantity: Number.NaN } as never]);
    const rows = await prisma.rfpLineItem.findMany({ where: { rfpId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "Projector", quantity: null, notes: null });
  });

  it.each([
    ["a list that isn't one", "rows"],
    ["a row with a filter object for an id", [{ ...line, avOrderId: { not: "" } }]],
    ["a row without a description", [{ ...line, description: undefined }]],
  ])("refuses line items given %s", async (_label, rows) => {
    const { eventId, rfpId } = await setup();
    await expect(saveRfpLineItems(rfpId, eventId, rows as never)).rejects.toBeInstanceOf(UserFacingError);
    expect(await prisma.rfpLineItem.count({ where: { rfpId } })).toBe(0);
  });

  it("refuses a concession whose required flag isn't a boolean", async () => {
    const { eventId, rfpId } = await setup();
    await expect(
      saveRfpConcessions(rfpId, eventId, [{ label: "Wi-Fi", value: null, required: "yes" }] as never),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("refuses a recipient update with a filter object for its id", async () => {
    const { eventId, rfpId } = await setup();
    await expect(
      updateRfpRecipient({ not: "" } as never, rfpId, eventId, { sentOn: null, declinedToBid: false, notes: null }),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("treats an RFP history query that isn't exactly one vendor or venue id as not found", async () => {
    await setup();
    const NOT_FOUND = { digest: expect.stringContaining("404") };
    await expect(getRfpHistory({ vendorId: { not: "" } } as never)).rejects.toMatchObject(NOT_FOUND);
    await expect(getRfpHistory({ vendorId: "v1", rfpId: "x" } as never)).rejects.toMatchObject(NOT_FOUND);
  });
});
