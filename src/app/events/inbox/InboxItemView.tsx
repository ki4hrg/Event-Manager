import type { FileUpload, InboundOrigin, InboundStatus } from "@prisma/client";
import { formatFileSize } from "@/lib/uploads";
import { formatRelativeTime } from "@/lib/relativeTime";
import { senderBadgeClass } from "./InboxList";
import { arrivalLabel, EMAIL_SOURCE_FILE_TYPE, SENDER_MATCH_LABELS, STATUS_LABELS } from "./views";

type Item = {
  origin: InboundOrigin;
  sender: string;
  forwardedFrom: string | null;
  envelopeTo: string;
  receivedAt: Date;
  status: InboundStatus;
  senderMatch: string | null;
  authResults: string | null;
  textBody: string | null;
  handledAt: Date | null;
  handledBy: { name: string | null; email: string } | null;
  files: FileUpload[];
};

// "spf=pass" / "dkim=fail" … from Authentication-Results, for the badge row.
function authVerdicts(results: string | null): string[] {
  if (!results) return [];
  const found = new Map<string, string>();
  for (const m of Array.from(results.matchAll(/\b(spf|dkim|dmarc)=(\w+)/gi))) {
    const key = m[1].toLowerCase();
    if (!found.has(key)) found.set(key, `${key.toUpperCase()} ${m[2].toLowerCase()}`);
  }
  return Array.from(found.values());
}

const labelClass = "text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

// The message, its sender and its files. The HTML part is never rendered —
// only text — since the mail comes from outside.
// timezone: the event's; Unrouted mail has none and shows UTC.
// diagnostics: the .eml and the SPF / DKIM / DMARC results (canSeeDiagnostics).
export function InboxItemView({
  item,
  timezone = "UTC",
  diagnostics = false,
  renderFileAction,
}: {
  item: Item;
  timezone?: string;
  diagnostics?: boolean;
  renderFileAction?: (file: FileUpload) => React.ReactNode;
}) {
  const source = item.files.find((f) => f.fileType === EMAIL_SOURCE_FILE_TYPE);
  const attachments = item.files.filter((f) => f.fileType !== EMAIL_SOURCE_FILE_TYPE);
  const verdicts = diagnostics ? authVerdicts(item.authResults) : [];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className={`${cardClass} min-w-0 space-y-4`}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">From</dt>
          <dd className="text-gray-900 dark:text-white break-words">{item.sender}</dd>
          {item.forwardedFrom && (
            <>
              <dt className="text-gray-500 dark:text-gray-400">Originally</dt>
              <dd className="text-gray-900 dark:text-white break-words">{item.forwardedFrom}</dd>
            </>
          )}
          <dt className="text-gray-500 dark:text-gray-400">{item.origin === "EMAIL" ? "To" : "Via"}</dt>
          <dd className={`text-gray-900 dark:text-white break-all ${item.origin === "EMAIL" ? "font-mono" : ""}`}>
            {arrivalLabel(item.origin, item.envelopeTo)}
          </dd>
          <dt className="text-gray-500 dark:text-gray-400">Received</dt>
          <dd className="text-gray-900 dark:text-white">{item.receivedAt.toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</dd>
        </dl>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700 pt-4">
          {item.textBody || "(no text)"}
        </pre>
      </div>

      <div className="space-y-4">
        <div className={`${cardClass} space-y-2`}>
          <p className={labelClass}>Status</p>
          <p className="text-sm text-gray-900 dark:text-white">{STATUS_LABELS[item.status]}</p>
          {item.handledAt && item.handledBy && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              by {item.handledBy.name || item.handledBy.email}, {formatRelativeTime(item.handledAt)}
            </p>
          )}
          <p className={`${labelClass} pt-2`}>Sender</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${senderBadgeClass(item.senderMatch)}`}>
              {item.senderMatch ? SENDER_MATCH_LABELS[item.senderMatch] ?? item.senderMatch : "Unknown sender"}
            </span>
            {verdicts.map((v) => (
              <span
                key={v}
                className={`text-xs px-1.5 py-0.5 rounded ${
                  v.endsWith("pass")
                    ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        <div className={`${cardClass} space-y-2`}>
          <p className={labelClass}>Attachments</p>
          {attachments.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">None</p>}
          <ul className="space-y-2">
            {attachments.map((f) => (
              <li key={f.id} className="text-sm">
                <a href={`/api/files/${f.id}`} className="text-blue-600 dark:text-blue-400 hover:underline break-all">
                  {f.fileName}
                </a>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatFileSize(f.fileSize)}</span>
                  {renderFileAction?.(f)}
                </div>
              </li>
            ))}
          </ul>
          {diagnostics && source && (
            <a href={`/api/files/${source.id}`} className="inline-block pt-2 text-xs text-gray-600 dark:text-gray-400 hover:underline">
              Original message (.eml)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
