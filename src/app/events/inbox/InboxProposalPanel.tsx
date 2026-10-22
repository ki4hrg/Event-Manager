import Link from "next/link";
import type { InboundStatus } from "@prisma/client";
import type { InboundProposal } from "@/lib/inboundParse";
import { KIND_LABELS } from "./views";
import { ReadingRefresh } from "./ReadingRefresh";

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-2";
const labelClass = "text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400";

// What Claude made of the message. Nothing for Held mail (not read until
// released) or when parsing is off.
export function InboxProposalPanel({
  status,
  proposal,
  error,
  model,
  parsing,
  diagnostics,
  appliedProposals = [],
  appliedLink = null,
}: {
  status: InboundStatus;
  proposal: InboundProposal | null;
  error: string | null;
  model: string | null;
  parsing: boolean;
  diagnostics: boolean;
  // Proposals saved from its offers (some may still be open).
  appliedProposals?: { name: string; href: string }[];
  appliedLink?: { label: string; href: string } | null;
}) {
  if (status === "HELD" || (!parsing && !proposal && !error)) return null;
  return (
    <div className={cardClass}>
      <p className={labelClass}>{proposal ? KIND_LABELS[proposal.kind] ?? proposal.kind : "Claude"}</p>
      {status === "RECEIVED" && <ReadingRefresh />}
      {status === "FAILED" && <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Couldn't read this message."}</p>}
      {proposal && (
        <>
          <p className="text-sm text-gray-900 dark:text-white">{proposal.summary}</p>
          {proposal.notes && <p className="text-sm text-amber-700 dark:text-amber-300">{proposal.notes}</p>}
        </>
      )}
      {appliedProposals.map((p) => (
        <p key={p.href} className="text-sm text-green-700 dark:text-green-400">
          Created{" "}
          <Link href={p.href} className="underline">
            {p.name} proposal
          </Link>
        </p>
      ))}
      {appliedLink && (
        <p className="text-sm text-green-700 dark:text-green-400">
          <Link href={appliedLink.href} className="underline">
            {appliedLink.label}
          </Link>
        </p>
      )}
      {diagnostics && model && <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{model}</p>}
    </div>
  );
}
