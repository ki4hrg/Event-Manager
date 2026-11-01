import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeMember, makeTenant } from "../../../test/fixtures";
import { createWorkflowStep, createWorkflowTemplate, updateWorkflowTemplate } from "./workflows/actions";
import { createOption } from "./settings/actions";
import { createUser } from "./users/actions";

// revalidatePath needs Next's request store, which tests don't have.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function admin(grants: Partial<Record<PermissionResource, PermissionLevel>>) {
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

const REDIRECTED = { digest: expect.stringContaining("NEXT_REDIRECT") };

beforeEach(() => vi.mocked(auth).mockReset());

describe("admin workflow templates: checked, not cast", () => {
  it("creates a template with known record types", async () => {
    const { tenantId } = await admin({ [PermissionResource.WORKFLOWS]: PermissionLevel.WRITE });
    await expect(createWorkflowTemplate(form({ name: "  Approval  ", defaultForEntityTypes: ["function"] }))).rejects.toMatchObject(REDIRECTED);
    const t = await prisma.workflowTemplate.findFirstOrThrow({ where: { tenantId } });
    expect(t).toMatchObject({ name: "Approval", defaultForEntityTypes: ["function"] });
  });

  it.each([
    ["no name", { name: "  " }, "Name is required"],
    ["an unknown record type", { name: "A", defaultForEntityTypes: ["constructor"] }, "Pick record types from the list"],
  ])("refuses %s", async (_label, fields, message) => {
    const { tenantId } = await admin({ [PermissionResource.WORKFLOWS]: PermissionLevel.WRITE });
    await expect(createWorkflowTemplate(form(fields))).resolves.toEqual({ error: expect.stringContaining(message) });
    expect(await prisma.workflowTemplate.count({ where: { tenantId } })).toBe(0);
  });

  it("refuses a status that isn't one, on the template and on a step", async () => {
    const { tenantId } = await admin({ [PermissionResource.WORKFLOWS]: PermissionLevel.WRITE });
    const t = await prisma.workflowTemplate.create({ data: { tenantId, name: "T" } });
    await expect(updateWorkflowTemplate(t.id, form({ name: "T", pendingStatusValue: "SHIPPED" }))).resolves.toHaveProperty("error");
    await expect(createWorkflowStep(t.id, form({ label: "Step", pendingStatusValue: "SHIPPED" }))).resolves.toHaveProperty("error");
    expect(await prisma.workflowStep.count({ where: { templateId: t.id } })).toBe(0);
  });
});

describe("settings options: checked, not cast", () => {
  it.each([
    ["a color that isn't on the picker", { label: "VIP", color: "url(evil)" }, "Pick a color from the list"],
    ["an over-long label", { label: "x".repeat(1_001) }, "Label must be at most 1000 characters"],
  ])("refuses %s", async (_label, fields, message) => {
    await admin({ [PermissionResource.SETTINGS]: PermissionLevel.WRITE });
    await expect(createOption("function_type", form(fields))).resolves.toEqual({ error: expect.stringContaining(message) });
  });
});

describe("user admin: the email is a real address", () => {
  it("refuses a malformed email before creating anyone", async () => {
    await admin({ [PermissionResource.USERS]: PermissionLevel.WRITE });
    await expect(createUser(form({ email: "not an email", roleId: "r1" }))).resolves.toEqual({ error: "Enter a valid email address" });
    expect(await prisma.user.count({ where: { email: "not an email" } })).toBe(0);
  });

  it("returns a duplicate-member refusal as { error } so the admin reads it (#252)", async () => {
    const { tenantId } = await admin({ [PermissionResource.USERS]: PermissionLevel.WRITE });
    const role = (await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId } })).roleId;
    const existing = await prisma.user.create({ data: { email: `dup-${tenantId}@example.test` } });
    await prisma.tenantMembership.create({ data: { tenantId, userId: existing.id, roleId: role } });
    await expect(createUser(form({ email: existing.email!, roleId: role }))).resolves.toEqual({ error: "A user with this email is already a member here" });
  });
});
