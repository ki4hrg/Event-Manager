// The reviewer's contact decision for a form that proposes a person. Public
// input never updates an existing contact: the reviewer creates a new one
// (the default) or links a tenant contact that shares the submitted email.

import { prisma } from "@/lib/prisma";
import { PermissionError } from "@/lib/permissions";
import type { ReviewChoice } from "./types";

export async function contactReviewChoice(
  key: string,
  label: string,
  email: string | null,
  tenantId: string,
): Promise<ReviewChoice> {
  const matches = email
    ? await prisma.contact.findMany({
        where: { tenantId, email: { equals: email, mode: "insensitive" } },
        select: { id: true, firstName: true, lastName: true, organization: true },
        take: 5,
      })
    : [];
  return {
    key,
    label,
    defaultValue: "new",
    options: [
      { value: "new", label: "Create a new contact" },
      ...matches.map((m) => ({
        value: `existing:${m.id}`,
        label: `Link existing contact: ${[[m.firstName, m.lastName].filter(Boolean).join(" "), m.organization].filter(Boolean).join(", ")}`,
      })),
      { value: "skip", label: "Don't add" },
    ],
  };
}

export type ResolvedContactChoice = { kind: "new" } | { kind: "existing"; contactId: string } | { kind: "skip" };

// An existing id must be the tenant's own; anything unrecognized skips.
export async function resolveContactChoice(value: string | undefined, tenantId: string): Promise<ResolvedContactChoice> {
  if (value === "new") return { kind: "new" };
  if (value?.startsWith("existing:")) {
    const contactId = value.slice("existing:".length);
    const found = await prisma.contact.findFirst({ where: { id: contactId, tenantId }, select: { id: true } });
    if (!found) throw new PermissionError("NOT_FOUND", "Contact not found");
    return { kind: "existing", contactId };
  }
  return { kind: "skip" };
}
