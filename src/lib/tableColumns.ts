// Per-user column visibility for table views. The setting stores the keys a
// user hid rather than the ones shown, so a column added later starts visible.

export type TableColumnDef<K extends string = string> = {
  key: K;
  label: string;
  /** Always shown; left out of the picker. */
  required?: boolean;
};

export const TABLE_IDS = [
  "functions",
  "presentations",
  "schedule_items",
  "av_orders",
  "setup_orders",
  "catering_orders",
  "print_orders",
  "media_deliverables",
] as const;

export type TableId = (typeof TABLE_IDS)[number];

const TABLE_ID_SET = new Set<string>(TABLE_IDS);

export function isTableId(value: string): value is TableId {
  return TABLE_ID_SET.has(value);
}

export function hiddenColumnsSettingKey(table: TableId): string {
  return `table_hidden_columns:${table}`;
}

/** Reads a stored setting, dropping anything that isn't a hideable column of this table. */
export function parseHiddenColumns<K extends string>(
  stored: readonly string[],
  columns: readonly TableColumnDef<K>[]
): Set<K> {
  const hideable = new Set<string>(columns.filter((c) => !c.required).map((c) => c.key));
  return new Set(stored.filter((k) => hideable.has(k)) as K[]);
}
