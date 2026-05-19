type VendorRef = { id: string; name: string } | null;
type ContactRef = { id: string; firstName: string; lastName: string } | null;

type PresentationAdvancer = {
  advancerVendor: VendorRef;
  advancerContact: ContactRef;
};

type SlotAdvancer = {
  advancerVendorId: string | null;
  advancerContactId: string | null;
  advancerVendor: VendorRef;
  advancerContact: ContactRef;
};

export function resolveAdvancer(
  presentation: PresentationAdvancer,
  slot?: SlotAdvancer | null,
): { vendor: VendorRef; contact: ContactRef; source: "presentation" | "slot" | "none" } {
  if (slot && (slot.advancerVendorId || slot.advancerContactId)) {
    return { vendor: slot.advancerVendor, contact: slot.advancerContact, source: "slot" };
  }
  if (presentation.advancerVendor || presentation.advancerContact) {
    return { vendor: presentation.advancerVendor, contact: presentation.advancerContact, source: "presentation" };
  }
  return { vendor: null, contact: null, source: "none" };
}
