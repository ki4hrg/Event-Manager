import Link from "next/link";
import type { InboundStatus } from "@prisma/client";
import { formatRelativeTime } from "@/lib/relativeTime";
import { KIND_LABELS, SENDER_MATCH_LABELS, STATUS_LABELS, type InboxView } from "./views";

type Item = {
  id: string;
  sender: string;
  forwardedFrom: string | null;
  subject: string | null;
  receivedAt: Date;
  status: InboundStatus;
  kind: string | null;
  senderMatch: string | null;
  envelopeTo: string;
  _count: { files: number };
};

const TABS: { view: InboxView; label: string }[] = [
  { view: "inbox", label: "Inbox" },
  { view: "held", label: "Held" },
  { view: "done", label: "Done" },
];

const tabClass = (active: boolean) =>
  `px-3 py-2 text-sm border-b-2 ${
    active
      ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300 font-medium"
      : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
  }`;

// Green: trusted for the event. Blue: known to the org, not tied to this
// event. Amber: unknown.
export function senderBadgeClass(match: string | null): string {
  if (match === "MEMBER" || match === "CONTACT") return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  if (match === "ORG_CONTACT") return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
}

export function InboxTabs({
  basePath,
  view,
  counts,
  only,
}: {
  basePath: string;
  view: InboxView;
  counts?: Partial<Record<InboxView, number>>;
  only?: InboxView[];
}) {
  const tabs = only ? TABS.filter((t) => only.includes(t.view)) : TABS;
  // The first tab is the bare path; the others carry ?view=.
  return (
    <nav className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto whitespace-nowrap">
      {tabs.map((t, i) => (
        <Link key={t.view} href={i === 0 ? basePath : `${basePath}?view=${t.view}`} className={tabClass(view === t.view)}>
          {t.label}
          {counts?.[t.view] ? ` (${counts[t.view]})` : ""}
        </Link>
      ))}
    </nav>
  );
}

export function InboxList({
  items,
  basePath,
  showRecipient = false,
  empty,
}: {
  items: Item[];
  basePath: string;
  showRecipient?: boolean;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{empty}</p>;
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`${basePath}/${item.id}`}
          className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-gray-900 dark:text-white truncate min-w-0">
              {item.subject || "(no subject)"}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{formatRelativeTime(item.receivedAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="truncate min-w-0">
              {item.sender}
              {item.forwardedFrom ? ` · fwd from ${item.forwardedFrom}` : ""}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${senderBadgeClass(item.senderMatch)}`}>
              {item.senderMatch ? SENDER_MATCH_LABELS[item.senderMatch] ?? item.senderMatch : "Unknown sender"}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {STATUS_LABELS[item.status]}
              {item.kind && item.kind !== "OTHER" ? ` · ${KIND_LABELS[item.kind] ?? item.kind}` : ""}
            </span>
            {item._count.files > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {item._count.files} attachment{item._count.files === 1 ? "" : "s"}
              </span>
            )}
            {showRecipient && <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{item.envelopeTo}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
