import { reportSectionCard } from "@/lib/reportStyles";

// Every report nests its own section cards inside this paper, so trim the outer
// padding on phones to leave room for them; sm+ and print keep reportSectionCard's.
const paperClass = reportSectionCard.replace("p-6", "px-3 py-4 sm:p-6");

type ReportPaperProps = {
  title: string;
  children: React.ReactNode;
};

export function ReportPaper({ title, children }: ReportPaperProps) {
  return (
    <section className={paperClass}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white pb-3 mb-5 border-b border-gray-200 dark:border-gray-700 print:text-black print:border-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}
