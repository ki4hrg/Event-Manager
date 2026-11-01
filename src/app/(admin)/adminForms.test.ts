import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { createOption, deleteOption, updateOption } from "./settings/actions";
import { createWorkflowTemplate } from "./workflows/actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function member(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, grants);
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id }, expires: "" } as never);
  return { tenantId: tenant.id };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => vi.mocked(auth).mockReset());

describe("admin settings and workflows (#252): refusals come back as { error }", () => {
  it("refuses a duplicate option label, and another tenant's option reads as not found", async () => {
    const { tenantId } = await member({ [PermissionResource.SETTINGS]: PermissionLevel.DELETE });
    await expect(createOption("dietary_need", form({ label: "Vegan" }))).resolves.toBeUndefined();
    await expect(createOption("dietary_need", form({ label: " vegan " }))).resolves.toHaveProperty("error");
    expect(await prisma.customOption.count({ where: { tenantId, category: "dietary_need", label: { contains: "egan" } } })).toBe(1);

    const other = await makeTenant();
    const theirs = await prisma.customOption.create({ data: { tenantId: other.id, category: "dietary_need", label: "Kosher" } });
    await expect(updateOption("dietary_need", theirs.id, form({ label: "Mine" }))).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(deleteOption("dietary_need", theirs.id)).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("refuses deleting a system option", async () => {
    const { tenantId } = await member({ [PermissionResource.SETTINGS]: PermissionLevel.DELETE });
    const sys = await prisma.customOption.create({ data: { tenantId, category: "dietary_need", label: "None", isSystem: true } });
    await expect(deleteOption("dietary_need", sys.id)).resolves.toEqual({ error: "Cannot delete a system option." });
  });

  it("refuses a workflow with no name", async () => {
    await member({ [PermissionResource.WORKFLOWS]: PermissionLevel.WRITE });
    await expect(createWorkflowTemplate(form({ name: " " }))).resolves.toHaveProperty("error");
  });
});
