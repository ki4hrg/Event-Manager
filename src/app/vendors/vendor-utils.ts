import type { ResponsiblePartyOptions } from "./actions";

export function flattenResponsiblePartyOptions(
  options: ResponsiblePartyOptions
): { id: string; name: string }[] {
  return [
    ...(options.systemVendor ? [options.systemVendor] : []),
    ...(options.venueVendor ? [options.venueVendor] : []),
    ...options.vendors,
  ];
}
