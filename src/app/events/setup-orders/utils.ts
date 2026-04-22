import type { SetupTable } from "@prisma/client";

export function getSetupOrderDisplayName(setupOrder: {
  name?: string | null;
  room?: { name: string } | null;
  description?: string | null;
}): string {
  if (setupOrder.name) return setupOrder.name;
  const parts = [setupOrder.room?.name, setupOrder.description].filter(Boolean);
  return parts.join(" — ") || "Unnamed Setup Order";
}

export function aggregateSetupTables(tables: SetupTable[]) {
  const tableTotals: Record<string, number> = {};
  const chairTotals: Record<string, number> = {};
  for (const row of tables) {
    if (row.tableType) {
      tableTotals[row.tableType] = (tableTotals[row.tableType] || 0) + row.quantity;
    }
    if (row.chairCount && row.chairType) {
      chairTotals[row.chairType] = (chairTotals[row.chairType] || 0) + (row.quantity > 0 ? row.quantity * row.chairCount : row.chairCount);
    }
  }
  return { tableTotals, chairTotals };
}
