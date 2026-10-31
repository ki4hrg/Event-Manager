import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../../test/fixtures";
import { cancelEntity, getWorkflowBadgeSummaries, setEntityStatus } from "./actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const NOT_FOUND = { digest: expect.stringContaining("404") };

async function setup() {
  const tenant = await makeTenant();
  // An event id as the target reads the UNASSIGNED grant (not staffed on it).
  const user = await makeMember(tenant.id, { [PermissionResource.FUNCTIONS]: PermissionLevel.WRITE }, PermissionScope.UNASSIGNED);
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  const fn = await prisma.function.create({ data: { eventId: event.id, name: "Opening" } });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { eventId: event.id, functionId: fn.id };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const stored = (id: string) => prisma.function.findUniqueOrThrow({ where: { id }, select: { status: true, substatus: true } });

beforeEach(() => vi.mocked(auth).mockReset());

describe("workflow actions: what a status change may store", () => {
  it("sets a known status and substatus, and clears both with empty values", async () => {
    const { eventId, functionId } = await setup();
    await setEntityStatus("function", functionId, eventId, form({ status: "IN_PROGRESS", substatus: "Signed " }));
    // Stored as sent: an option label with a trailing space must still match its option.
    expect(await stored(functionId)).toEqual({ status: "IN_PROGRESS", substatus: "Signed " });
    await setEntityStatus("function", functionId, eventId, form({ status: "", substatus: "" }));
    expect(await stored(functionId)).toEqual({ status: null, substatus: null });
  });

  it("refuses a status that isn't one, and an over-long substatus", async () => {
    const { eventId, functionId } = await setup();
    await expect(setEntityStatus("function", functionId, eventId, form({ status: "SHIPPED" }))).rejects.toBeInstanceOf(ZodError);
    await expect(
      setEntityStatus("function", functionId, eventId, form({ status: "IN_PROGRESS", substatus: "x".repeat(1001) })),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(cancelEntity("function", functionId, "x".repeat(1001), eventId)).rejects.toBeInstanceOf(ZodError);
    expect(await stored(functionId)).toEqual({ status: null, substatus: null });
  });

  it.each(["vendor", "constructor", "__proto__"])("treats entity type %s as not found", async (entityType) => {
    const { eventId, functionId } = await setup();
    await expect(setEntityStatus(entityType as never, functionId, eventId, form({ status: "IN_PROGRESS" }))).rejects.toMatchObject(NOT_FOUND);
  });

  it("treats a malformed entity or event id as not found", async () => {
    const { eventId, functionId } = await setup();
    await expect(setEntityStatus("function", { id: 1 } as never, eventId, form({ status: "IN_PROGRESS" }))).rejects.toMatchObject(NOT_FOUND);
    await expect(setEntityStatus("function", functionId, { tenantId: "x" } as never, form({ status: "IN_PROGRESS" }))).rejects.toMatchObject(NOT_FOUND);
  });

  it("refuses badge ids that aren't a list of ids", async () => {
    const { eventId, functionId } = await setup();
    await expect(getWorkflowBadgeSummaries("function", "abc" as never, eventId)).rejects.toBeInstanceOf(ZodError);
    await expect(getWorkflowBadgeSummaries("function", [functionId], eventId)).resolves.toEqual({});
  });
});

describe("requirePermission: an event id from the client", () => {
  it("treats a non-string event id as not found instead of a tenant-wide check", async () => {
    const { requirePermission } = await import("@/lib/permissions");
    await setup();
    await expect(requirePermission("FUNCTIONS", "VIEW", { tenantId: "x" } as never)).rejects.toMatchObject(NOT_FOUND);
  });
});
