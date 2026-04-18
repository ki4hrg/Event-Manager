"use client";

type View = "list" | "table";

type ViewToggleProps = {
  view: View;
  onChange: (v: View) => void;
};

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="flex rounded border border-gray-300 dark:border-gray-700 overflow-hidden">
      {(["list", "table"] as View[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 text-sm capitalize ${
            view === v
              ? "bg-blue-600 text-white"
              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
