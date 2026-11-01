import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { createRfp, saveRfpConcessions } from "./rfps/actions";
import { createMediaDeliverable } from "./media-deliverables/actions";
import { createSpecificationRow } from "./specifications/actions";
import { createVendorQuote } from "./quotes/actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function event(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, grants, PermissionScope.UNASSIGNED);
  const ev = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { eventId: ev.id };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("RFP, media and specification forms (#252): refusals come back as { error }", () => {
  it("refuses an RFP or a media deliverable with no name, writing nothing", async () => {
    const { eventId } = await event({
      [PermissionResource.HOTELS]: PermissionLevel.WRITE,
      [PermissionResource.MEDIA_DELIVERABLES]: PermissionLevel.WRITE,
    });
    await expect(createRfp(eventId, "HOTEL", form({ title: " " }))).resolves.toHaveProperty("error");
    expect(await prisma.rfp.count({ where: { eventId } })).toBe(0);
    await expect(createMediaDeliverable(eventId, form({ name: " " }))).resolves.toEqual({ error: "Name is required" });
    expect(await prisma.mediaDeliverable.count({ where: { eventId } })).toBe(0);
  });

  it("returns core refusals from specifications and quotes as { error }, writing nothing", async () => {
    const { eventId } = await event({ [PermissionResource.EVENTS]: PermissionLevel.WRITE });
    await expect(createSpecificationRow(eventId, "vips", form({ title: "CEO" }))).resolves.toEqual({ error: "Name is required" });
    const tenantId = (await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).tenantId;
    const vendor = await prisma.vendor.create({ data: { tenantId, name: "AV Co" } as never });
    await expect(
      createVendorQuote(eventId, null, form({ vendorId: vendor.id, submittedOn: "2026-10-10", validUntil: "2026-10-01" })),
    ).resolves.toEqual({ error: "Valid until can't be before the submitted date" });
    expect(await prisma.vendorQuote.count({ where: { eventId } })).toBe(0);
  });

  it("returns an RFP card's refusal to its autosave as { error }", async () => {
    const { eventId } = await event({ [PermissionResource.EVENTS]: PermissionLevel.WRITE });
    const rfp = await prisma.rfp.create({ data: { eventId, kind: "OTHER", title: "Staging" } as never });
    const term = { id: null, label: "Deposit", value: "10%", required: false };
    // "Deposit" isn't on the tenant's term list: the person can fix that in Settings.
    await expect(saveRfpConcessions(rfp.id, eventId, [term])).resolves.toEqual({
      error: '"Deposit" isn\'t in the RFP term list (Settings › RFPs › Terms)',
    });
  });
});
