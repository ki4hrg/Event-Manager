import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { createFunction, createSchedule } from "./functions/actions";
import { createTrack } from "./presentations/actions";

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

describe("program forms (#252): refusals come back as { error }", () => {
  it("refuses a schedule time that isn't one, or that ends first, writing nothing", async () => {
    const { eventId } = await event({ [PermissionResource.FUNCTIONS]: PermissionLevel.WRITE });
    const fn = await prisma.function.create({ data: { eventId, name: "Keynote" } as never });
    const add = (fields: Record<string, string>) => createSchedule(fn.id, eventId, form({ type: "Main", ...fields }));
    await expect(add({ startTime: "2026-11-01T09:00" })).resolves.toEqual({ error: "End time is required" });
    await expect(add({ startTime: "2026-11-01T09:00", endTime: "2026-11-01T25:00" })).resolves.toEqual({
      error: "End time must be a date and time",
    });
    await expect(add({ startTime: "2026-11-01T10:00", endTime: "2026-11-01T09:00" })).resolves.toEqual({
      error: "End time must be after start time",
    });
    expect(await prisma.functionSchedule.count({ where: { functionId: fn.id } })).toBe(0);
  });

  it("refuses a function whose optional times are reversed, and a track with no name", async () => {
    const { eventId } = await event({
      [PermissionResource.FUNCTIONS]: PermissionLevel.WRITE,
      [PermissionResource.PRESENTATIONS]: PermissionLevel.WRITE,
    });
    await expect(
      createFunction(eventId, form({ name: "Lunch", startTime: "2026-11-01T13:00", endTime: "2026-11-01T12:00" })),
    ).resolves.toEqual({ error: "End time must be after start time" });
    expect(await prisma.function.count({ where: { eventId } })).toBe(0);
    await expect(createTrack(eventId, form({ name: " " }))).resolves.toHaveProperty("error");
  });
});
