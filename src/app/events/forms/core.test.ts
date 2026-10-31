import { describe, expect, it } from "vitest";
import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/userErrors";
import { makeMember, makeTenant } from "../../../../test/fixtures";
import { createFormLinkCore, type CreateFormLinkArgs } from "./core";

async function setup() {
  const tenant = await makeTenant();
  const user = await makeMember(tenant.id, { [PermissionResource.FORMS]: PermissionLevel.WRITE }, PermissionScope.UNASSIGNED);
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, name: "Expo", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-03") },
  });
  return { userId: user.id, eventId: event.id };
}

const args = (eventId: string, over: Partial<Record<keyof CreateFormLinkArgs, unknown>> = {}) =>
  ({
    eventId,
    formType: "ITEM_REQUEST",
    functionId: null,
    contactId: null,
    presentationId: null,
    boothGroupId: null,
    label: null,
    recipientName: null,
    recipientEmail: null,
    sections: [],
    intro: null,
    mediaUploadUrl: null,
    options: null,
    workflowTemplateId: null,
    dueAt: null,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    maxSubmissions: null,
    ...over,
  }) as CreateFormLinkArgs;

describe("createFormLinkCore: what a form link may store", () => {
  it("creates a link, trimming text and lower-casing the email", async () => {
    const { userId, eventId } = await setup();
    const link = await createFormLinkCore(
      args(eventId, { label: "  Swag  ", recipientEmail: " Ada@Example.test ", recipientName: "Ada", maxSubmissions: 5 }),
      userId,
    );
    expect(link).toMatchObject({ label: "Swag", recipientEmail: "ada@example.test", maxSubmissions: 5 });
  });

  it.each([
    ["an unknown form type", { formType: "PAYROLL" }, "Invalid formType"],
    ["an unknown bundled form type", { alsoFormTypes: ["PAYROLL"] }, "Invalid alsoFormTypes"],
    ["a malformed recipient email", { recipientEmail: "not an email" }, "Enter a valid recipient email"],
    ["a non-numeric response limit", { maxSubmissions: Number("lots") }, "Responses allowed must be a whole number"],
    ["a fractional response limit", { maxSubmissions: 2.5 }, "Responses allowed must be a whole number"],
    ["an over-long intro", { intro: "x".repeat(5001) }, "Intro must be at most 5000 characters"],
    ["a malformed target id", { contactId: { not: "" } }, "Invalid contactId"],
  ])("refuses %s with a message the person can read", async (_label, over, message) => {
    const { userId, eventId } = await setup();
    const result = createFormLinkCore(args(eventId, over), userId);
    await expect(result).rejects.toBeInstanceOf(UserFacingError);
    await expect(result).rejects.toThrow(message);
    expect(await prisma.formLink.count({ where: { eventId } })).toBe(0);
  });
});
