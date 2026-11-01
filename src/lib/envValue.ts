// The one clean-up every environment reader applies (#275): trim, and drop
// one pair of surrounding quotes (an env file or panel that keeps them).
// Blank, or blank inside the quotes, is absent. No imports: lib/uploads, which
// client components import, uses it too.
export function envValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let value = raw.trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    value = value.slice(1, -1).trim();
  }
  return value === "" ? undefined : value;
}
