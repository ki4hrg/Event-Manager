import { ReportNav } from "@/components/ReportNav";
import { reportFooterText, reportSectionCard } from "@/lib/reportStyles";
import type { PerDocument } from "@/lib/esg/per";
import { EsgSectionView } from "../esg/EsgBlocks";

// APEX Post-Event Report, sections I–IX. Renders the assembled PerDocument so
// the page, print route and share views match.

const cardClass = reportSectionCard.replace("p-6", "px-3 py-4 sm:p-6");

export function PostEventReport({ doc }: { doc: PerDocument }) {
  return (
    <div className="space-y-6">
      <ReportNav sections={doc.sections.map((s) => ({ id: `per-${s.letter.toLowerCase()}`, label: `${s.letter}. ${s.title}` }))} />
      <div className={cardClass}>
        <p className="text-sm text-gray-900 dark:text-white print:text-black font-medium">{doc.meta.eventName}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{doc.meta.eventDates}</p>
      </div>
      {doc.sections.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
      ) : (
        doc.sections.map((s) => (
          <div key={s.letter} className={cardClass}>
            <EsgSectionView id={`per-${s.letter.toLowerCase()}`} section={s} />
          </div>
        ))
      )}
      <p className={`${reportFooterText} pt-2`}>
        {doc.attribution} Reproduced {doc.meta.generatedAt}.
      </p>
    </div>
  );
}
