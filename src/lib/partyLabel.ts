export function partyLabel(
  vendorObj: { name: string } | null | undefined,
  contactObj: { firstName: string; lastName: string } | null | undefined
): string | null {
  if (vendorObj) return vendorObj.name;
  if (contactObj)
    return [contactObj.firstName, contactObj.lastName].filter(Boolean).join(" ");
  return null;
}
