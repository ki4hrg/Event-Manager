import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { reportFooterText, reportSectionCardCompact as cardClass } from "@/lib/reportStyles";
import type { PerDocument } from "@/lib/esg/per";
import { EsgSectionView } from "../esg/EsgBlocks";

// APEX Post-Event Report, sections I–IX. Renders the assembled PerDocument so
// the page, print route and share views match. Anchors follow the ESG
// report's (`section-<letter>`).

export function PostEventReport({ doc }: { doc: PerDocument }) {
  const anchor = (letter: string) => `section-${letter.toLowerCase()}`;
  return (
    <div className="space-y-6">
      <ReportNav sections={doc.sections.map((s) => ({ id: anchor(s.letter), label: `${s.letter}. ${s.title}` }))} />
      <div id="summary" className={`${cardClass} scroll-mt-24`}>
        <p className="text-sm text-gray-900 dark:text-white print:text-black font-medium">{doc.meta.eventName}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{doc.meta.eventDates}</p>
      </div>
      {doc.sections.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
      ) : (
        doc.sections.map((s) => (
          <section key={s.letter} className="space-y-3">
            <SectionDivider id={anchor(s.letter)} title={`${s.letter}. ${s.title}${s.na ? " · Not applicable" : ""}`} />
            {s.blocks.length > 0 && (
              <div className={`${cardClass} print:break-inside-avoid`}>
                <EsgSectionView section={s} heading={false} />
              </div>
            )}
          </section>
        ))
      )}
      <p className={`${reportFooterText} pt-2`}>
        {doc.attribution} Generated {doc.meta.generatedAt}.
      </p>
    </div>
  );
}
