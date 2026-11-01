import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { addEventKeyStaff, updateEvent, updateEventAreas } from "./actions";
import { bulkUpdateScheduleItems } from "./schedule-items/actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function event(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, grants, PermissionScope.UNASSIGNED);
  const ev = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { tenantId: tenant.id, eventId: ev.id };
}

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("event core: arguments and form fields are checked", () => {
  it("refuses key staff with no contact or with an order type that isn't one", async () => {
    const { tenantId, eventId } = await event({ [PermissionResource.EVENTS]: PermissionLevel.WRITE });
    const contact = await prisma.contact.create({ data: { tenantId, firstName: "Ada", lastName: "L" } });
    await expect(addEventKeyStaff(eventId, form({ title: "Lead" }))).resolves.toEqual({ error: "Pick a contact" });
    await expect(addEventKeyStaff(eventId, form({ contactId: contact.id, models: ["PAYROLL"] }))).resolves.toEqual({ error: "Pick order types from the list" });
    expect(await prisma.eventKeyStaff.count({ where: { eventId } })).toBe(0);

    await expect(addEventKeyStaff(eventId, form({ contactId: contact.id, title: "Lead" }))).resolves.toBeUndefined();
    await expect(addEventKeyStaff(eventId, form({ contactId: contact.id, title: "Lead" }))).resolves.toEqual({
      error: "That contact already has that title on this event",
    });
  });

  it("refuses an event that ends before it starts", async () => {
    const { eventId } = await event({ [PermissionResource.EVENTS]: PermissionLevel.WRITE });
    await expect(updateEvent(eventId, form({ name: "Expo", startDate: "2026-11-03", endDate: "2026-11-01" }))).resolves.toEqual({
      error: "End date can't be before the start date",
    });
  });

  it("refuses event areas that aren't lists of text", async () => {
    const { eventId } = await event({ [PermissionResource.EVENTS]: PermissionLevel.WRITE });
    await expect(updateEventAreas(eventId, { regions: "everywhere", areas: [] } as never)).rejects.toBeInstanceOf(UserFacingError);
  });

  it("refuses a bulk schedule update naming any field but type and visibility", async () => {
    const { eventId } = await event({ [PermissionResource.FUNCTIONS]: PermissionLevel.WRITE });
    await expect(bulkUpdateScheduleItems([], eventId, { functionId: "x" } as never)).rejects.toBeInstanceOf(UserFacingError);
  });
});
