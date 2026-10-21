// Chrome for the public form pages: no app header, no session. Takes only the
// public DTO the page builds — never the FormLink row, whose staff-only
// fields would otherwise serialize into the page payload.

export type PublicFormDto = {
  eventName: string;
  title: string;
  targetName: string | null;
  recipientName: string | null;
  dueAt: string | null;
  intro: string | null;
};

export function FormShell({ form, children }: { form: PublicFormDto; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-4 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{form.eventName}</p>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white break-words">
            {form.title}
            {form.targetName && <span className="text-gray-500 dark:text-gray-400 font-normal"> · {form.targetName}</span>}
          </h1>
          {form.dueAt && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Please respond by {form.dueAt}</p>
          )}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {form.intro && (
          <p className="mb-6 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{form.intro}</p>
        )}
        {children}
      </main>
    </div>
  );
}

export function FormMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {children && <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">{children}</div>}
    </div>
  );
}
