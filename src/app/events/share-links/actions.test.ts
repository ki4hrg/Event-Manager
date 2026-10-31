import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../../test/fixtures";
import { createShareLink } from "./actions";
import {
  addShareLinkGroupItem,
  createShareLinkGroup,
  reorderShareLinkGroupItems,
  updateShareLinkGroup,
  updateShareLinkGroupItem,
} from "../share-link-groups/actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { SHARE_LINKS } = PermissionResource;
const { VIEW, WRITE } = PermissionLevel;

function signIn(userId: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId }, expires: "" } as never);
}

async function setup(level: PermissionLevel = WRITE) {
  const tenant = await makeTenant();
  // An event id as the target reads the UNASSIGNED grant (not staffed on it).
  const user = await makeMember(tenant.id, { [SHARE_LINKS]: level }, PermissionScope.UNASSIGNED);
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  signIn(user.id);
  return { eventId: event.id };
}

const link = (eventId: string, over: Record<string, unknown> = {}) =>
  ({ eventId, reportType: "VENDOR_HANDOFF", filters: {}, filtersLocked: true, ...over }) as never;

beforeEach(() => vi.mocked(auth).mockReset());

describe("createShareLink: what a public share link may store", () => {
  it("keeps the report's own filter keys and drops the rest", async () => {
    const { eventId } = await setup();
    const created = await createShareLink(
      link(eventId, {
        filters: { vendorId: "v1", includeBilling: true, blockTypes: ["STAFF"], extra: { nested: 1 } },
        label: "  For the AV crew  ",
        expiresAt: "2026-12-01",
      }),
    );
    expect(created.filters).toEqual({ vendorId: "v1" });
    expect(created.label).toBe("For the AV crew");
    expect(created.expiresAt).toEqual(new Date("2026-12-01"));
  });

  it("refuses a report type that isn't shareable", async () => {
    const { eventId } = await setup();
    await expect(createShareLink(link(eventId, { reportType: "USERS" }))).rejects.toBeInstanceOf(ZodError);
  });

  it("refuses filters of the wrong shape", async () => {
    const { eventId } = await setup();
    await expect(createShareLink(link(eventId, { filters: { vendorId: ["v1"] } }))).rejects.toBeInstanceOf(ZodError);
    await expect(createShareLink(link(eventId, { filters: "everything" }))).rejects.toBeInstanceOf(ZodError);
    await expect(
      createShareLink(link(eventId, { reportType: "ROOM_SCHEDULE", filters: { rooms: [{ id: "r1" }] } })),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      createShareLink(link(eventId, { reportType: "ROOM_SCHEDULE", filters: { rooms: Array(1001).fill("r") } })),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("refuses an expiry that isn't a date", async () => {
    const { eventId } = await setup();
    await expect(createShareLink(link(eventId, { expiresAt: "someday" }))).rejects.toBeInstanceOf(ZodError);
    expect(await prisma.shareLink.count({ where: { eventId } })).toBe(0);
  });

  it("refuses a member whose role only grants VIEW", async () => {
    const { eventId } = await setup(VIEW);
    await expect(createShareLink(link(eventId))).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect(await prisma.shareLink.count({ where: { eventId } })).toBe(0);
  });
});

describe("share-link dashboards: what an item may store", () => {
  it("checks an item's filters against its report type, on add and on update", async () => {
    const { eventId } = await setup();
    const group = await createShareLinkGroup({ eventId, label: null });
    const item = await addShareLinkGroupItem(group.id, {
      reportType: "POST_EVENT",
      filters: { showBlank: true, vendorIds: ["v1"] },
      filtersLocked: true,
    });
    expect(item.filters).toEqual({ showBlank: true });

    await expect(updateShareLinkGroupItem(item.id, { filters: { showBlank: "yes" } as never })).rejects.toBeInstanceOf(ZodError);
    await updateShareLinkGroupItem(item.id, { filters: { showBlank: false, days: ["2026-11-01"] } });
    await updateShareLinkGroupItem(item.id, { label: "Recap" });
    const after = await prisma.shareLinkGroupItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.filters).toEqual({ showBlank: false });
    expect(after.label).toBe("Recap");
  });

  it("refuses an item for a report type that isn't shareable", async () => {
    const { eventId } = await setup();
    const group = await createShareLinkGroup({ eventId });
    await expect(
      addShareLinkGroupItem(group.id, { reportType: "NOPE", filters: {}, filtersLocked: true }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("changes only the dashboard fields it is given, and refuses a bad expiry", async () => {
    const { eventId } = await setup();
    const group = await createShareLinkGroup({ eventId, label: "Board", expiresAt: "2026-12-01" });
    await updateShareLinkGroup(group.id, { label: "Board v2" });
    await expect(updateShareLinkGroup(group.id, { expiresAt: "not-a-date" })).rejects.toBeInstanceOf(ZodError);
    const after = await prisma.shareLinkGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(after.label).toBe("Board v2");
    expect(after.expiresAt).toEqual(new Date("2026-12-01"));

    await updateShareLinkGroup(group.id, { expiresAt: null });
    const cleared = await prisma.shareLinkGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(cleared.expiresAt).toBeNull();
  });

  it("refuses a reorder that isn't a list of ids", async () => {
    const { eventId } = await setup();
    const group = await createShareLinkGroup({ eventId });
    await expect(reorderShareLinkGroupItems(group.id, "abc" as never)).rejects.toBeInstanceOf(ZodError);
    await expect(reorderShareLinkGroupItems(group.id, Array(501).fill("x"))).rejects.toBeInstanceOf(ZodError);
  });
});
