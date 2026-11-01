import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../../test/fixtures";
import { bulkUpdatePresentations, importPresentationsFromCSV, updatePresentationInstanceCount } from "./actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function event() {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, { [PermissionResource.PRESENTATIONS]: PermissionLevel.WRITE }, PermissionScope.UNASSIGNED);
  const ev = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { eventId: ev.id };
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("presentations: client arguments are checked", () => {
  it("refuses a bulk update naming any field beyond status, substatus, track and type", async () => {
    const { eventId } = await event();
    const p = await prisma.presentation.create({ data: { eventId, title: "Keynote" } });
    await expect(bulkUpdatePresentations([p.id], eventId, { eventId: "elsewhere" } as never)).rejects.toBeInstanceOf(UserFacingError);
    expect((await prisma.presentation.findUniqueOrThrow({ where: { id: p.id } })).eventId).toBe(eventId);
  });

  it("refuses an instance count that isn't a whole number from 1 to 100", async () => {
    const { eventId } = await event();
    const p = await prisma.presentation.create({ data: { eventId, title: "Keynote" } });
    await expect(updatePresentationInstanceCount(p.id, eventId, 0)).rejects.toBeInstanceOf(UserFacingError);
    await expect(updatePresentationInstanceCount(p.id, eventId, 2.5)).rejects.toBeInstanceOf(UserFacingError);
  });

  it("refuses an import mapping to an unknown destination, and reports a bad instance count per row", async () => {
    const { eventId } = await event();
    await expect(
      importPresentationsFromCSV(eventId, [{ Title: "A" }], { Title: "presentation.eventId" } as never),
    ).rejects.toBeInstanceOf(UserFacingError);
    const result = await importPresentationsFromCSV(
      eventId,
      [{ Title: "A", Count: "lots" }, { Title: "B", Count: "2" }],
      { Title: "presentation.title", Count: "presentation.instanceCount" },
    );
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([{ row: 1, message: expect.stringContaining("Instance count") }]);
  });
});
