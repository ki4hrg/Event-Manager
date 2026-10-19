"use server";

import { requireAuth } from "@/lib/auth";
import { getUserSetting, setUserSetting } from "@/lib/userSettings";
import { hiddenColumnsSettingKey, isTableId, type TableId } from "@/lib/tableColumns";

const MAX_KEYS = 64;

// Raw stored keys; callers narrow them with parseHiddenColumns against the
// table's column list.
export async function getHiddenColumns(table: TableId): Promise<string[]> {
  const session = await requireAuth();
  if (!isTableId(table)) return [];
  const raw = await getUserSetting(session.user.id, hiddenColumnsSettingKey(table));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export async function setHiddenColumns(table: TableId, hidden: string[]): Promise<void> {
  const session = await requireAuth();
  if (!isTableId(table)) throw new Error(`Unknown table: ${table}`);
  const keys = hidden.filter((k) => typeof k === "string" && k.length <= 64).slice(0, MAX_KEYS);
  await setUserSetting(session.user.id, hiddenColumnsSettingKey(table), JSON.stringify(keys));
}
