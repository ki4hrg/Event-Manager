import type { SetupTable } from "@prisma/client";

export function getSetupOrderDisplayName(setupOrder: {
  name?: string | null;
  setupType?: string | null;
  room?: { name: string } | null;
}): string {
  return setupOrder.name || setupOrder.setupType || setupOrder.room?.name || "Unnamed Setup Order";
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
