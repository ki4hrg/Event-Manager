import { prisma } from "@/lib/prisma";
import { getResponsiblePartyVendors, type ResponsiblePartyOptions } from "@/app/vendors/actions";
import type { ContactOptions } from "@/app/events/av-orders/party-field";

export type ResponsiblePartyPool = {
  vendorGroups: ResponsiblePartyOptions;
  contacts: ContactOptions;
};

export type ResponsiblePartyModelType =
  | "AV_ORDER"
  | "MEDIA_DELIVERABLE"
  | "CATERING_ORDER"
  | "SETUP_ORDER"
  | "PRINT_ORDER"
  | "SUPPLY_ORDER";

type RawContact = { id: string; firstName: string; lastName: string; organization: string | null };

export type ResponsiblePartyScope = {
  eventId: string;
  modelType: ResponsiblePartyModelType;
  orderContacts?: { contact: RawContact }[];
  functionIds?: string[];
  presentationIds?: string[];
};

export async function getResponsibleParties(scope: ResponsiblePartyScope): Promise<ResponsiblePartyPool> {
  // Exhaustiveness check — adding a new model type fails the build instead of silently producing an empty pool.
  switch (scope.modelType) {
    case "AV_ORDER":
    case "MEDIA_DELIVERABLE":
    case "CATERING_ORDER":
    case "SETUP_ORDER":
    case "PRINT_ORDER":
    case "SUPPLY_ORDER":
      break;
    default: {
      const _exhaustive: never = scope.modelType;
      throw new Error(`Unhandled responsible-party model type: ${_exhaustive}`);
    }
  }

  const functionIds = scope.functionIds ?? [];
  const presentationIds = scope.presentationIds ?? [];

  const [vendorGroups, functionContacts, presentationSpeakers] = await Promise.all([
    getResponsiblePartyVendors(scope.eventId, scope.modelType),
    functionIds.length
      ? prisma.functionContact.findMany({
          where: { functionId: { in: functionIds } },
          select: {
            contact: {
              select: { id: true, firstName: true, lastName: true, organization: true },
            },
          },
        })
      : Promise.resolve([] as { contact: RawContact }[]),
    presentationIds.length
      ? prisma.presentationContact.findMany({
          where: { presentationId: { in: presentationIds } },
          select: {
            contact: {
              select: { id: true, firstName: true, lastName: true, organization: true },
            },
          },
        })
      : Promise.resolve([] as { contact: RawContact }[]),
  ]);

  const map = new Map<string, RawContact>();
  for (const row of scope.orderContacts ?? []) map.set(row.contact.id, row.contact);
  for (const row of functionContacts) map.set(row.contact.id, row.contact);
  for (const row of presentationSpeakers) map.set(row.contact.id, row.contact);

  const contacts: ContactOptions = Array.from(map.values()).sort((a, b) => {
    const last = a.lastName.localeCompare(b.lastName);
    return last !== 0 ? last : a.firstName.localeCompare(b.firstName);
  });

  return { vendorGroups, contacts };
}
