import Link from "next/link";

type Tab = { label: string; value: string };

type DetailTabsProps = {
  tabs: Tab[];
  basePath: string;
  activeTab: string;
};

export function DetailTabs({ tabs, basePath, activeTab }: DetailTabsProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav className="-mb-px flex gap-6">
        {tabs.map(({ label, value }) => {
          const isActive = activeTab === value;
          return (
            <Link
              key={value}
              href={`${basePath}?tab=${value}`}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
