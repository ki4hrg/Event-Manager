import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../test/fixtures";
import { createVendor } from "./vendors/actions";
import { createRoom } from "./venues/actions";
import { createContactCore } from "./contacts/core";
import { createVendorCore } from "./vendors/core";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function member(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, grants);
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { tenantId: tenant.id };
}

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("directory forms: checked, not cast", () => {
  it("refuses a vendor with no name or with an order type that isn't one", async () => {
    const { tenantId } = await member({ [PermissionResource.VENDORS]: PermissionLevel.WRITE });
    await expect(createVendor(form({ name: "   " }))).rejects.toThrow("Name is required");
    await expect(createVendor(form({ name: "Acme", models: ["PAYROLL"] }))).rejects.toThrow("Pick order types from the list");
    expect(await prisma.vendor.count({ where: { tenantId } })).toBe(0);
  });

  it("refuses a room capacity that isn't a whole number", async () => {
    const { tenantId } = await member({ [PermissionResource.VENUES]: PermissionLevel.WRITE });
    const venue = await prisma.venue.create({ data: { tenantId, name: "Hall" } });
    await expect(createRoom(venue.id, form({ name: "A", capacity: "lots" }))).rejects.toThrow("Capacity must be a whole number");
    await expect(
      createRoom(venue.id, form({ name: "A", capacitySetup: ["Theater"], capacityCount: ["many"] })),
    ).rejects.toThrow("Capacity must be a whole number");
    expect(await prisma.room.count({ where: { venueId: venue.id } })).toBe(0);
  });

  it("holds the cores (and so MCP) to vendor order types and a contact name", async () => {
    const { tenantId } = await member({ [PermissionResource.VENDORS]: PermissionLevel.WRITE, [PermissionResource.CONTACTS]: PermissionLevel.WRITE });
    const user = (await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId } })).userId;
    await expect(createVendorCore({ name: "Acme", models: ["PAYROLL"], notes: null } as never, user, tenantId)).rejects.toThrow(
      "Pick order types from the list",
    );
    await expect(
      createContactCore({ firstName: " ", lastName: "", email: null, phone: null, organization: null, notes: null, roles: [] }, user, tenantId),
    ).rejects.toThrow("Enter a first or last name");
  });
});
