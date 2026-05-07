import type { ResponsiblePartyGroup } from "./actions";

export function partyGroupKey(group: Pick<ResponsiblePartyGroup, "partyType" | "partyId">): string {
  return group.partyType === "unassigned" ? "__unassigned__" : `${group.partyType}:${group.partyId}`;
}
