// What a card's autosave is doing (useAutosave), beside its heading.
export function AutosaveStatus({ saving, error, saved }: { saving: boolean; error: string | null; saved: boolean }) {
  if (error) return <span className="text-xs text-red-600 dark:text-red-400">Not saved: {error}</span>;
  if (saving) return <span className="text-xs text-gray-500 dark:text-gray-400">Saving…</span>;
  if (saved) return <span className="text-xs text-gray-500 dark:text-gray-400">Saved</span>;
  return null;
}
