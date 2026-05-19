export function formatMediaOrderProvidedBy(
  vendors: { vendor: { name: string } }[],
  contacts: { contact: { firstName: string; lastName: string }; role: string | null }[],
): string[] {
  return [
    ...vendors.map((v) => v.vendor.name),
    ...contacts.map((c) => {
      const name = `${c.contact.firstName} ${c.contact.lastName}`.trim();
      return c.role ? `${name} (${c.role})` : name;
    }),
  ];
}
