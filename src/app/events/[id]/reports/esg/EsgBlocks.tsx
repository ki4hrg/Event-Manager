import { reportTd, reportTh } from "@/lib/reportStyles";
import type { EsgBlock, EsgItem, EsgSection, EsgTable } from "@/lib/esg/types";

// Generic renderers for EsgDocument blocks, shared by every ESG part.

const richClass =
  "text-sm text-gray-900 dark:text-white print:text-black [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1";

function ItemView({ item }: { item: EsgItem }) {
  const hasHtml = !!item.html;
  return (
    <div className={hasHtml || (item.value?.length ?? 0) > 80 ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 print:text-gray-600">{item.label}</dt>
      {hasHtml ? (
        // HTML from RichTextEditor (tiptap): ESG narrative fields, setup details, menus.
        <dd className={`mt-0.5 ${richClass}`} dangerouslySetInnerHTML={{ __html: item.html! }} />
      ) : null}
      {item.value !== null || !hasHtml ? (
        <dd className="mt-0.5 text-sm text-gray-900 dark:text-white print:text-black whitespace-pre-wrap">
          {item.value ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
        </dd>
      ) : null}
    </div>
  );
}

function TableView({ table }: { table: EsgTable }) {
  const [first, ...rest] = table.columns;
  return (
    <div>
      {table.title && (
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 print:text-gray-700 mb-1">
          {table.title}
        </h4>
      )}
      {/* Mobile: one card per row. */}
      <ul className="sm:hidden print:hidden space-y-2">
        {table.rows.map((row, i) => (
          <li key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm">
            <p className="font-semibold text-gray-900 dark:text-white whitespace-pre-wrap">{row[0] ?? "—"}</p>
            {rest.map((col, j) =>
              row[j + 1] ? (
                <p key={col} className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  <span className="text-gray-500 dark:text-gray-500">{(col || first).replace(/[?:]$/, "")}: </span>
                  {row[j + 1]}
                </p>
              ) : null,
            )}
          </li>
        ))}
      </ul>
      {/* Desktop / print table. */}
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              {table.columns.map((c, i) => (
                <th key={i} className={`${reportTh} ${table.numeric?.[i] ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={`${reportTd} whitespace-pre-wrap ${table.numeric?.[j] ? "text-right tabular-nums" : ""}`}>
                    {cell ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EsgBlockView({ block }: { block: EsgBlock }) {
  switch (block.kind) {
    case "fields":
      return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-3">
          {block.items.map((item, i) => (
            <ItemView key={i} item={item} />
          ))}
        </dl>
      );
    case "table":
      return <TableView table={block.table} />;
    case "note":
      return <p className="text-sm text-gray-500 dark:text-gray-400 print:text-gray-600">{block.text}</p>;
    default: {
      const _exhaustive: never = block;
      throw new Error(`Unhandled ESG block: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// `heading={false}` when a SectionDivider already titles the section (PER).
export function EsgSectionView({ section, id, heading = true }: { section: EsgSection; id?: string; heading?: boolean }) {
  return (
    <div id={id} className="scroll-mt-24 print:break-inside-avoid">
      {heading && (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white print:text-black mb-2">
          <span className="text-gray-400 dark:text-gray-500 print:text-gray-600 mr-1.5">{section.letter}.</span>
          {section.title}
          {section.na && <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">Not applicable</span>}
        </h3>
      )}
      <div className="space-y-3">
        {section.blocks.map((b, i) => (
          <EsgBlockView key={i} block={b} />
        ))}
      </div>
    </div>
  );
}
