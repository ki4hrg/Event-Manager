export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-700 print:text-black border-b border-gray-200 pb-1 mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="mb-2">
      <span className="text-sm font-medium text-gray-500 print:text-gray-600">{label}: </span>
      <span className="text-sm text-gray-900 print:text-black whitespace-pre-wrap">{value}</span>
    </div>
  );
}
