import type { EsgSectionDef } from "@/lib/esg/fields";

// Sticky jump nav over the entry cards. Muted: N/A; amber: required fields missing.
export function SpecSectionNav({
  sections,
  na,
  missingIn,
}: {
  sections: Pick<EsgSectionDef<string>, "letter" | "title" | "short">[];
  na: Set<string>;
  missingIn: (letter: string) => number;
}) {
  return (
    <nav
      aria-label="Sections"
      className="sticky top-2 z-10 flex gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 p-2 text-sm"
    >
      {sections.map((s) => (
        <a
          key={s.letter}
          href={`#spec-${s.letter.toLowerCase()}`}
          title={s.title}
          className={`shrink-0 rounded px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 ${
            na.has(s.letter)
              ? "text-gray-400 dark:text-gray-500"
              : missingIn(s.letter) > 0
                ? "text-amber-700 dark:text-amber-300 font-medium"
                : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {s.short ?? s.title}
        </a>
      ))}
    </nav>
  );
}
