import { PrintButton } from "./PrintButton";

interface PrintHeaderProps {
  eventName: string;
  title?: string;
  recordType?: string;
  recordName?: string;
  backHref?: string;
}

export function PrintHeader({ eventName, title, recordType, recordName, backHref }: PrintHeaderProps) {
  const heading = title ?? `${recordType}: ${recordName}`;
  const generated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <div className="flex flex-wrap justify-between items-start gap-3 mb-6 print:mb-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 print:text-gray-600">{eventName}</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white print:text-black break-words">{heading}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 print:hidden">Generated {generated}</p>
        </div>
        <PrintButton backHref={backHref} />
      </div>
      <hr className="border-gray-200 dark:border-gray-700 print:border-gray-200 mb-6 print:mb-4" />
    </>
  );
}
