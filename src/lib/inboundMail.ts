import crypto from "crypto";
import { simpleParser, type ParsedMail, type Attachment } from "mailparser";

// Reading inbound mail for event inboxes (docs/proposals/email-ingest.md).
// The forward handling is ported from Expense Tracker's
// worker/email-ingest/forwarded.ts: hotel paperwork usually reaches the inbox
// forwarded by staff, so `From:` is the forwarder and the hotel is in the
// quoted headers or an attached `message/rfc822` copy.

export type OriginalSender = { name: string | null; address: string | null };

// ─── Addresses ───────────────────────────────────────────────────────────────

// Tenant and event slugs are [a-z0-9-] (slugifyTenantName / slugifyInboxSlug),
// so the first "." always separates them.
export function parseInboxAddress(
  address: string,
  domain: string,
): { tenantSlug: string; eventSlug: string } | null {
  const at = address.trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return null;
  const local = address.trim().toLowerCase().slice(0, at).split("+")[0];
  if (address.trim().toLowerCase().slice(at + 1) !== domain) return null;
  const dot = local.indexOf(".");
  if (dot < 1 || dot === local.length - 1) return null;
  const tenantSlug = local.slice(0, dot);
  const eventSlug = local.slice(dot + 1);
  if (!/^[a-z0-9-]+$/.test(tenantSlug) || !/^[a-z0-9-]+$/.test(eventSlug)) return null;
  return { tenantSlug, eventSlug };
}

export function slugifyInboxSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

// ─── Signature ───────────────────────────────────────────────────────────────

// HMAC-SHA256 over `${timestamp}.${body}`, hex. Must match
// workers/email-inbound/src/index.ts.
export const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export function verifyInboundSignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: Buffer,
  now = Date.now(),
): boolean {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > SIGNATURE_MAX_SKEW_MS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ─── Dedupe ──────────────────────────────────────────────────────────────────

// Keyed per recipient address: one message copied to two event inboxes is two
// items, a retried delivery to the same inbox is one.
export function buildDedupKey(parsed: ParsedMail, envelopeTo: string, receivedAt: Date): string {
  const to = envelopeTo.trim().toLowerCase();
  const messageId = parsed.messageId?.replace(/^<|>$/g, "").trim().toLowerCase();
  if (messageId) return `${to}:msgid:${messageId}`;
  const hash = crypto
    .createHash("sha256")
    .update(parsed.from?.text ?? "")
    .update("\n")
    .update(parsed.subject ?? "")
    .update("\n")
    .update(receivedAt.toISOString())
    .update("\n")
    .update((parsed.text ?? "").slice(0, 512))
    .digest("hex");
  return `${to}:hash:${hash}`;
}

// ─── Forwards ────────────────────────────────────────────────────────────────

// "Fwd:", "FW:", and the common non-English prefixes clients prepend.
const FORWARD_SUBJECT_RE = /^\s*(?:re\s*:\s*)*(?:fwd?|fw|tr|wg|rv|enc|vs)\s*:/i;

// Banners clients write above quoted original headers. Broad on purpose: it
// only locates headers, which are then judged on whose address they name.
const QUOTED_HEADER_BANNER = String.raw`-{2,}\s*(?:forwarded message|original message|original-nachricht|message transféré)\s*-{2,}|begin forwarded message\s*:?|^[ \t]*_{5,}[ \t]*$`;

// The banners only a forward produces. A reply quotes headers too, and its
// quoted `From:` is not who sent the mail.
const FORWARD_BANNER_RE = /-{2,}\s*forwarded message\s*-{2,}|begin forwarded message\s*:?|-{2,}\s*message transféré\s*-{2,}/i;

// A quoted `From:` header, indented, ">"-quoted or bolded, in a few languages.
const FROM_LINE_RE = /^[ \t>|*]*(?:from|von|de|da|från|fra|mittente)\s*:[ \t]*(.+)$/im;

// How far past a banner the `From:` line still counts as part of it.
const BANNER_WINDOW = 1200;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#34": '"',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    const code = key.startsWith("#x") ? parseInt(key.slice(2), 16) : key.startsWith("#") ? Number(key.slice(1)) : NaN;
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

// Flatten HTML to text, keeping line breaks: the line structure is what makes
// quoted headers readable (Gmail writes its forward banner as `<br>`s).
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
      .replace(/<(?:div|p|tr|li|h[1-6]|hr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function messageText(parsed: ParsedMail): string | null {
  if (parsed.text?.trim()) return parsed.text.trim();
  if (parsed.html) return htmlToText(String(parsed.html)) || null;
  return null;
}

function bodyTexts(parsed: ParsedMail): string[] {
  const texts: string[] = [];
  if (parsed.text) texts.push(parsed.text);
  if (parsed.html) texts.push(htmlToText(String(parsed.html)));
  return texts;
}

// Every address on the wrapper: the forwarder and whoever they sent it to.
function wrapperAddresses(parsed: ParsedMail): Set<string> {
  const addresses = new Set<string>();
  for (const field of [parsed.from, parsed.to, parsed.cc].flat()) {
    for (const entry of field?.value ?? []) {
      if (entry.address) addresses.add(entry.address.toLowerCase());
    }
  }
  return addresses;
}

function cleanName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/[\s,;:*<[(-]+$/, "")
    .trim();
  return name || null;
}

// One `From:` value: `Name <a@b.com>`, Outlook's `Name [mailto:a@b.com]`, or a
// bare address. Anything after the address is dropped.
function parseSenderLine(value: string): OriginalSender | null {
  const patterns = [
    /<\s*([^<>\s@]+@[^<>\s@]+)\s*>/,
    /\[?\s*mailto:\s*([^\]\s<>]+@[^\]\s<>]+)/i,
    /([A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match.index !== undefined) {
      return { name: cleanName(value.slice(0, match.index)), address: match[1].replace(/[.,;:]+$/, "").toLowerCase() };
    }
  }
  return null;
}

// The first quoted `From:` naming somebody other than the forwarder and their
// correspondents (those are the forwarder's own mail quoted back).
function findQuotedSender(parsed: ParsedMail): OriginalSender | null {
  const own = wrapperAddresses(parsed);
  const subjectSaysForwarded = FORWARD_SUBJECT_RE.test(parsed.subject ?? "");
  for (const body of bodyTexts(parsed)) {
    const candidates: string[] = [];
    const banners = new RegExp(QUOTED_HEADER_BANNER, "gim");
    let banner: RegExpExecArray | null;
    while ((banner = banners.exec(body)) !== null) {
      const start = banner.index + banner[0].length;
      const line = body.slice(start, start + BANNER_WINDOW).match(FROM_LINE_RE);
      if (line?.[1]) candidates.push(line[1]);
    }
    if (candidates.length === 0 && subjectSaysForwarded) {
      const lines = new RegExp(FROM_LINE_RE.source, "gim");
      let line: RegExpExecArray | null;
      while ((line = lines.exec(body)) !== null) if (line[1]) candidates.push(line[1]);
    }
    for (const candidate of candidates) {
      const sender = parseSenderLine(candidate);
      if (sender?.address && !own.has(sender.address)) return sender;
    }
  }
  return null;
}

function isMessagePart(a: Attachment): boolean {
  return a.contentType?.toLowerCase() === "message/rfc822" || !!a.filename?.toLowerCase().endsWith(".eml");
}

// The original message of a "forward as attachment": its body, sender and own
// attachments are the hotel's.
export async function parseAttachedMessage(parsed: ParsedMail): Promise<ParsedMail | null> {
  for (const attachment of parsed.attachments ?? []) {
    if (!isMessagePart(attachment) || !attachment.content) continue;
    try {
      const inner = await simpleParser(attachment.content);
      if (inner.from || inner.subject || inner.text || inner.html) return inner;
    } catch {
      // An unparseable nested part is no worse than none.
    }
  }
  return null;
}

function looksForwarded(parsed: ParsedMail): boolean {
  return FORWARD_SUBJECT_RE.test(parsed.subject ?? "") || bodyTexts(parsed).some((b) => FORWARD_BANNER_RE.test(b));
}

export function findOriginalSender(parsed: ParsedMail, attached: ParsedMail | null): OriginalSender | null {
  const attachedFrom = attached?.from?.value?.[0];
  if (attachedFrom?.address || attachedFrom?.name) {
    return { name: attachedFrom.name?.trim() || null, address: attachedFrom.address?.toLowerCase() || null };
  }
  return looksForwarded(parsed) ? findQuotedSender(parsed) : null;
}

export function formatSender(sender: OriginalSender | null): string | null {
  if (!sender) return null;
  if (sender.name && sender.address) return `${sender.name} <${sender.address}>`;
  return sender.name || sender.address || null;
}

// ─── The whole message ───────────────────────────────────────────────────────

export type ReadMessage = {
  parsed: ParsedMail;
  sender: string;
  senderAddress: string | null;
  forwardedFrom: OriginalSender | null;
  subject: string | null;
  receivedAt: Date;
  textBody: string | null;
  authResults: string | null;
  // The files worth keeping: the wrapper's own attachments (other than the
  // forwarded message itself) plus the forwarded message's attachments.
  attachments: { fileName: string; mimeType: string; content: Buffer }[];
};

export async function readMessage(raw: Buffer): Promise<ReadMessage> {
  const parsed = await simpleParser(raw);
  const attached = await parseAttachedMessage(parsed);
  const from = parsed.from?.value?.[0];
  const outerText = messageText(parsed);
  const innerText = attached ? messageText(attached) : null;
  const textBody = [outerText, innerText && `--- Attached message${attached?.subject ? `: ${attached.subject}` : ""} ---\n${innerText}`]
    .filter(Boolean)
    .join("\n\n") || null;
  const auth = parsed.headers.get("authentication-results");
  const keep = (list: Attachment[] | undefined) =>
    (list ?? [])
      // Inline images are signature logos; an inline PDF (Apple Mail) is real.
      .filter((a) => !isMessagePart(a) && !(a.contentDisposition === "inline" && a.contentType?.startsWith("image/")) && a.content?.length)
      .map((a) => ({
        fileName: a.filename || "attachment",
        mimeType: a.contentType || "application/octet-stream",
        content: a.content,
      }));
  return {
    parsed,
    sender: parsed.from?.text || from?.address || "(unknown)",
    senderAddress: from?.address?.toLowerCase() ?? null,
    forwardedFrom: findOriginalSender(parsed, attached),
    subject: parsed.subject || null,
    receivedAt: parsed.date ?? new Date(),
    textBody,
    authResults: typeof auth === "string" ? auth : Array.isArray(auth) ? auth.join("\n") : null,
    attachments: [...keep(parsed.attachments), ...keep(attached?.attachments)],
  };
}
