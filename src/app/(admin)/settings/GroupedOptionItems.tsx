// <option>s for picking one of a list's entries, under their group headings
// when the list has groups (concession headings, an area's region) — the same
// grouping the list's pickers elsewhere show. Entries without a known group
// go under `fallback` when given, else after the groups.

export type GroupedEntry = { id: string; label: string; group: string | null };

export function GroupedOptionItems({
  entries,
  groups,
  fallback,
}: {
  entries: GroupedEntry[];
  groups?: { value: string; label: string }[];
  fallback?: string;
}) {
  if (!groups?.length) {
    return (
      <>
        {entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </>
    );
  }
  const known = new Set(groups.map((g) => g.value));
  const groupOf = (e: GroupedEntry) => (e.group && known.has(e.group) ? e.group : (fallback ?? null));
  const loose = entries.filter((e) => groupOf(e) == null);
  return (
    <>
      {groups.map((g) => {
        const shown = entries.filter((e) => groupOf(e) === g.value);
        return shown.length ? (
          <optgroup key={g.value} label={g.label}>
            {shown.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
      {loose.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </>
  );
}
