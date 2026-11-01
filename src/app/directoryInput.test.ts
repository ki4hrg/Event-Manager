import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../test/fixtures";
import { addVendorContact, createVendor } from "./vendors/actions";
import { addVenueContact, createAndAddVenueContact, createRoom, createVenue } from "./venues/actions";
import { createEquipment, deleteEquipment, updateEquipment } from "./equipment/actions";
import { deleteStorageLocation } from "./storage-locations/actions";
import { createContact } from "./contacts/actions";
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
  it("returns a delete that something still depends on as { error }, deleting nothing", async () => {
    const { tenantId } = await member({
      [PermissionResource.EQUIPMENT]: PermissionLevel.DELETE,
      [PermissionResource.STORAGE_LOCATIONS]: PermissionLevel.DELETE,
    });
    const easel = await prisma.equipment.create({ data: { tenantId, name: "Easel", category: "Display" } });
    const shelf = await prisma.storageLocation.create({ data: { tenantId, name: "Shelf A" } });
    await prisma.inventoryItem.create({ data: { tenantId, equipmentId: easel.id, locationId: shelf.id } });
    await expect(deleteEquipment(easel.id)).resolves.toEqual({
      error: '"Easel" is stocked in 1 location. Remove those inventory items first.',
    });
    await expect(deleteStorageLocation(shelf.id)).resolves.toEqual({
      error: '"Shelf A" still holds 1 item. Move or delete them first.',
    });
    expect(await prisma.equipment.count({ where: { id: easel.id } })).toBe(1);
    expect(await prisma.storageLocation.count({ where: { id: shelf.id } })).toBe(1);

    // Another tenant's equipment or location reads as not found, not as a refusal.
    const other = await makeTenant();
    const theirs = await prisma.equipment.create({ data: { tenantId: other.id, name: "Easel", category: "Display" } });
    const theirShelf = await prisma.storageLocation.create({ data: { tenantId: other.id, name: "Shelf B" } });
    await expect(deleteEquipment(theirs.id)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(deleteStorageLocation(theirShelf.id)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(deleteStorageLocation({ not: "" } as never)).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("returns directory refusals as { error }: no name, a duplicate, and still not-found for another tenant", async () => {
    const { tenantId } = await member({
      [PermissionResource.VENUES]: PermissionLevel.WRITE,
      [PermissionResource.EQUIPMENT]: PermissionLevel.WRITE,
      [PermissionResource.CONTACTS]: PermissionLevel.WRITE,
    });
    await expect(createVenue(form({ name: " " }))).resolves.toEqual({ error: "Name is required" });
    await expect(createContact(form({ firstName: "", lastName: "" }))).resolves.toEqual({ error: "Enter a first or last name" });
    await expect(createEquipment(form({ name: "Riser", category: "Staging" }))).resolves.toBeUndefined();
    await expect(createEquipment(form({ name: "Riser", category: "Staging" }))).resolves.toEqual({
      error: "There's already equipment with that name in this category",
    });
    expect(await prisma.equipment.count({ where: { tenantId, name: "Riser" } })).toBe(1);

    const other = await makeTenant();
    const foreign = await prisma.equipment.create({ data: { tenantId: other.id, name: "Mic", category: "Audio" } });
    await expect(updateEquipment(foreign.id, form({ name: "Mine", category: "Audio" }))).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("refuses linking a vendor contact twice and keeps the primary where it was", async () => {
    const { tenantId } = await member({ [PermissionResource.VENDORS]: PermissionLevel.WRITE });
    const vendor = await prisma.vendor.create({ data: { tenantId, name: "Caterer" } as never });
    const [a, b] = await Promise.all(
      ["A", "B"].map((n) => prisma.contact.create({ data: { tenantId, firstName: n, lastName: "L" } })),
    );
    await addVendorContact(vendor.id, form({ contactId: a.id, isPrimary: "true" }));
    await addVendorContact(vendor.id, form({ contactId: b.id }));
    await expect(addVendorContact(vendor.id, form({ contactId: b.id, isPrimary: "true" }))).resolves.toEqual({
      error: "Already a contact here",
    });
    const primary = await prisma.vendorContact.findFirst({ where: { vendorId: vendor.id, isPrimary: true } });
    expect(primary?.contactId).toBe(a.id);
  });

  it("returns venue contact refusals as { error }: none picked, linked twice, no name", async () => {
    const { tenantId } = await member({ [PermissionResource.VENUES]: PermissionLevel.WRITE });
    const venue = await prisma.venue.create({ data: { tenantId, name: "Hall" } });
    const ada = await prisma.contact.create({ data: { tenantId, firstName: "Ada", lastName: "L" } });
    await expect(addVenueContact(venue.id, form({ role: "Sales" }))).resolves.toHaveProperty("error");
    await expect(addVenueContact(venue.id, form({ contactId: ada.id }))).resolves.toBeUndefined();
    await expect(addVenueContact(venue.id, form({ contactId: ada.id }))).resolves.toEqual({ error: "Already a contact here" });
    await expect(createAndAddVenueContact(venue.id, form({ firstName: "Bo", lastName: " " }))).resolves.toHaveProperty("error");
    expect(await prisma.contact.count({ where: { tenantId } })).toBe(1);
  });

  it("refuses a vendor with no name or with an order type that isn't one", async () => {
    const { tenantId } = await member({ [PermissionResource.VENDORS]: PermissionLevel.WRITE });
    await expect(createVendor(form({ name: "   " }))).resolves.toEqual({ error: "Name is required" });
    await expect(createVendor(form({ name: "Acme", models: ["PAYROLL"] }))).resolves.toEqual({ error: "Pick order types from the list" });
    expect(await prisma.vendor.count({ where: { tenantId } })).toBe(0);
  });

  it("refuses a room capacity that isn't a whole number", async () => {
    const { tenantId } = await member({ [PermissionResource.VENUES]: PermissionLevel.WRITE });
    const venue = await prisma.venue.create({ data: { tenantId, name: "Hall" } });
    await expect(createRoom(venue.id, form({ name: "A", capacity: "lots" }))).resolves.toEqual({ error: "Capacity must be a whole number" });
    await expect(
      createRoom(venue.id, form({ name: "A", capacitySetup: ["Theater"], capacityCount: ["many"] })),
    ).resolves.toEqual({ error: "Capacity must be a whole number" });
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
