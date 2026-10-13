// Converts RichTextEditor (tiptap StarterKit) HTML into neutral blocks for
// the .docx / .xlsx renderers. Handles the tags StarterKit emits: p, h1–h3,
// ul/ol/li, blockquote, br, hr, strong/b, em/i, s, code, a. Anything else is
// reduced to its text. Pure.

export type RichRun = { text: string; bold?: boolean; italic?: boolean; strike?: boolean };
export type RichBlock =
  | { type: "paragraph"; runs: RichRun[]; heading?: boolean }
  | { type: "list"; ordered: boolean; items: RichRun[][] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Inline HTML → runs, tracking bold / italic / strike nesting.
function parseInline(html: string): RichRun[] {
  const runs: RichRun[] = [];
  const state = { bold: 0, italic: 0, strike: 0 };
  const re = /<(\/?)([a-z0-9]+)[^>]*>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) {
      const text = decode(m[3]);
      if (text) runs.push({ text, bold: state.bold > 0, italic: state.italic > 0, strike: state.strike > 0 });
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const delta = closing ? -1 : 1;
    if (tag === "strong" || tag === "b") state.bold = Math.max(0, state.bold + delta);
    else if (tag === "em" || tag === "i") state.italic = Math.max(0, state.italic + delta);
    else if (tag === "s" || tag === "strike" || tag === "del") state.strike = Math.max(0, state.strike + delta);
    else if (tag === "br" && !closing) runs.push({ text: "\n" });
  }
  return runs;
}

function trimRuns(runs: RichRun[]): RichRun[] {
  const out = runs.map((r) => ({ ...r }));
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, "");
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  return out.filter((r) => r.text);
}

export function htmlToBlocks(html: string | null | undefined): RichBlock[] {
  if (!html) return [];
  const blocks: RichBlock[] = [];
  const re = /<(p|h[1-6]|blockquote|ul|ol|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(html))) {
    const between = html.slice(last, m.index).trim();
    if (between) blocks.push({ type: "paragraph", runs: parseInline(between) });
    last = re.lastIndex;
    const tag = (m[1] ?? "hr").toLowerCase();
    const inner = m[2] ?? "";
    if (tag === "ul" || tag === "ol") {
      const items: RichRun[][] = [];
      const li = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let lm: RegExpExecArray | null;
      while ((lm = li.exec(inner))) {
        // Nested lists flatten into the item's text (rare in StarterKit use).
        items.push(trimRuns(parseInline(lm[1].replace(/<\/?(p|ul|ol)\b[^>]*>/gi, " "))));
      }
      blocks.push({ type: "list", ordered: tag === "ol", items });
    } else if (tag !== "hr") {
      const runs = parseInline(inner.replace(/<\/?p\b[^>]*>/gi, ""));
      if (runs.some((r) => r.text.trim())) blocks.push({ type: "paragraph", runs, heading: /^h[1-6]$/.test(tag) });
    }
  }
  const tail = html.slice(last).trim();
  if (tail) blocks.push({ type: "paragraph", runs: parseInline(tail) });
  return blocks;
}

// Plain text with "• " bullets — the xlsx fallback.
export function htmlToPlainText(html: string | null | undefined): string {
  return htmlToBlocks(html)
    .map((b) =>
      b.type === "paragraph"
        ? b.runs.map((r) => r.text).join("")
        : b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "•"} ${it.map((r) => r.text).join("")}`).join("\n"),
    )
    .join("\n")
    .trim();
}
