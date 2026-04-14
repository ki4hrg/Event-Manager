type RollupRow = {
  label: string;
  quantity: number;
  source: string;
};

export function AVOrderEquipmentRollup({ rows }: { rows: RollupRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Equipment Summary</h2>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div
            key={i}
            className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-between"
          >
            <div>
              <span className="text-gray-900 dark:text-white font-medium">{row.label}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">× {row.quantity}</span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">{row.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
