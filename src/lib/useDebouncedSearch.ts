import { useEffect, useState } from "react";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

// Type-ahead search against a Server Action: waits 300ms after the last
// keystroke, needs at least 2 characters, and ignores responses for a query the
// user has already typed past. Results are derived rather than cleared inside
// the effect (react-hooks/set-state-in-effect), so a short query simply shows
// none. Pass `enabled: false` to switch the search off (e.g. while a dropdown is
// shown instead).
export function useDebouncedSearch<T>(
  fetcher: (query: string) => Promise<T[]>,
  { enabled = true }: { enabled?: boolean } = {}
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const active = enabled && query.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await fetcher(query);
        if (!cancelled) setResults(found);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [active, query, fetcher]);

  function clear() {
    setQuery("");
    setResults([]);
    setIsSearching(false);
  }

  return {
    query,
    setQuery,
    results: active ? results : [],
    isSearching: active && isSearching,
    // True once a finished search came back empty — drives "No matches" copy.
    noMatches: active && !isSearching && results.length === 0,
    clear,
  };
}
