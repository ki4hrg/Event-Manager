import { useState, useTransition } from "react";
import { setHiddenColumns } from "@/app/events/table-columns-actions";
import type { TableId } from "@/lib/tableColumns";

/**
 * Column visibility for a table view, seeded from the server-read setting and
 * saved back on every change. `isVisible` is what the table renders against.
 */
export function useHiddenColumns<K extends string>(table: TableId, initial: Set<K>) {
  const [hidden, setHidden] = useState<Set<K>>(initial);
  const [, startTransition] = useTransition();

  function setColumnHidden(key: K, hide: boolean) {
    const next = new Set(hidden);
    if (hide) next.add(key);
    else next.delete(key);
    setHidden(next);
    startTransition(async () => {
      await setHiddenColumns(table, Array.from(next));
    });
  }

  function showAll() {
    setHidden(new Set());
    startTransition(async () => {
      await setHiddenColumns(table, []);
    });
  }

  return {
    hidden,
    isVisible: (key: K) => !hidden.has(key),
    setColumnHidden,
    showAll,
  };
}
