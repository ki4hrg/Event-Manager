import { reportSectionCard } from "@/lib/reportStyles";

type ReportPaperProps = {
  title: string;
  children: React.ReactNode;
};

export function ReportPaper({ title, children }: ReportPaperProps) {
  return (
    <section className={reportSectionCard}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white pb-3 mb-5 border-b border-gray-200 dark:border-gray-700 print:text-black print:border-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}
