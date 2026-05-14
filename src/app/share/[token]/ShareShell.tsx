type ShareShellProps = {
  eventName: string;
  reportTitle: string;
  label?: string | null;
  printHref: string;
  children: React.ReactNode;
};

export function ShareShell({ eventName, reportTitle, label, printHref, children }: ShareShellProps) {
  const generated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{eventName}</p>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">
              {label ?? reportTitle}
            </h1>
          </div>
          <a
            href={printHref}
            className="shrink-0 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Print / Save PDF
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="print:hidden border-t border-gray-200 dark:border-gray-700 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Shared view — generated {generated}
          </p>
        </div>
      </footer>
    </div>
  );
}
