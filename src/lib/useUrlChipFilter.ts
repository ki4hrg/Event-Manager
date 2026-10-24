import { useRouter, useSearchParams } from "next/navigation";

export function toggleValue(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

// URL-backed report filters. Every key is namespaced with `paramPrefix`
// (`i_${itemId}_` on a share-dashboard tab, "" elsewhere); every change is a
// `router.push` to `basePath`, so filter state stays bookmarkable.
export function useUrlChipFilter(paramPrefix: string, basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key = (name: string) => `${paramPrefix}${name}`;

  // `mutate` sees the current params and the prefixed-key helper.
  function update(mutate: (params: URLSearchParams, key: (name: string) => string) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params, key);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  // Comma-joined list; an empty list removes the param (empty = All).
  function setList(name: string, values: string[]) {
    update((p) => (values.length > 0 ? p.set(key(name), values.join(",")) : p.delete(key(name))));
  }

  function toggle(name: string, selected: string[], value: string) {
    setList(name, toggleValue(selected, value));
  }

  // Bucket chip: deselect every id when all are on, otherwise add the missing ones.
  function toggleAll(name: string, selected: string[], ids: string[], allActive: boolean) {
    setList(
      name,
      allActive ? selected.filter((id) => !ids.includes(id)) : Array.from(new Set([...selected, ...ids])),
    );
  }

  // Present-or-absent flag: `on` writes `value`, off removes the param.
  function setFlag(name: string, on: boolean, value = "true") {
    update((p) => (on ? p.set(key(name), value) : p.delete(key(name))));
  }

  function clear(names: string[]) {
    update((p) => names.forEach((n) => p.delete(key(n))));
  }

  const query = searchParams.toString();
  const printHref = `${basePath}/print${query ? `?${query}` : ""}`;

  return { key, update, setList, toggle, toggleAll, setFlag, clear, printHref };
}
