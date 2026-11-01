import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../../test/fixtures";
import { bulkUpdateFunctions } from "./actions";
import { bulkUpdateFunctionsCore } from "./core";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function eventWithFunction() {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, { [PermissionResource.FUNCTIONS]: PermissionLevel.WRITE }, PermissionScope.UNASSIGNED);
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  const fn = await prisma.function.create({ data: { eventId: event.id, name: "Opening" } });
  return { userId: user.id, eventId: event.id, functionId: fn.id };
}

const signIn = (userId: string) => vi.mocked(auth).mockResolvedValue({ user: { id: userId }, expires: "" } as never);

beforeEach(() => vi.mocked(auth).mockReset());

describe("bulk function updates touch only status, substatus and type", () => {
  it("refuses an update naming any other column, so functions can't be moved to another event", async () => {
    const mine = await eventWithFunction();
    const theirs = await eventWithFunction();
    signIn(mine.userId);
    await expect(
      bulkUpdateFunctions([mine.functionId], mine.eventId, { eventId: theirs.eventId } as never),
    ).rejects.toBeInstanceOf(UserFacingError);
    const after = await prisma.function.findUniqueOrThrow({ where: { id: mine.functionId } });
    expect(after.eventId).toBe(mine.eventId);
  });

  it("refuses any other key at the core too, whoever calls it", async () => {
    const mine = await eventWithFunction();
    const theirs = await eventWithFunction();
    await expect(
      bulkUpdateFunctionsCore([mine.functionId], mine.eventId, { status: "IN_PROGRESS", eventId: theirs.eventId } as never, mine.userId),
    ).rejects.toBeInstanceOf(UserFacingError);
    const after = await prisma.function.findUniqueOrThrow({ where: { id: mine.functionId } });
    expect(after.eventId).toBe(mine.eventId);
  });

  it("advertises the real statuses on every MCP status tool", async () => {
    const { classifiedTools } = await import("@/lib/mcpTools");
    const statusEnums = (classifiedTools() as { inputSchema: { properties?: Record<string, { enum?: string[] }> } }[])
      .map((t) => t.inputSchema.properties?.status?.enum)
      .filter((e): e is string[] => Array.isArray(e) && e.includes("IN_PROGRESS"));
    expect(statusEnums.length).toBeGreaterThan(0);
    for (const e of statusEnums) expect([...e].sort()).toEqual(["CANCELLED", "COMPLETE", "IN_PROGRESS", "PENDING"]);
  });

  it("applies a well-formed update", async () => {
    const { userId, eventId, functionId } = await eventWithFunction();
    signIn(userId);
    await bulkUpdateFunctions([functionId], eventId, { status: "COMPLETE" });
    expect((await prisma.function.findUniqueOrThrow({ where: { id: functionId } })).status).toBe("COMPLETE");
  });
});
