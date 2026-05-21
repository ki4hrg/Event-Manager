import { formatAbsoluteTime, formatRelativeTime, isRecent } from "@/lib/relativeTime";

type Props = {
  updatedAt: Date | string | null | undefined;
  updatedBy?: { name: string | null; email: string } | null;
  timezone?: string;
  /** When true, omits the "by …" segment (e.g. unauthenticated share view). */
  hideUser?: boolean;
  /** Extra classes for wrapper layout. */
  className?: string;
};

type Tier = "veryRecent" | "recent" | "old";

const TIER_CLASSES: Record<Tier, { dot: string; text: string }> = {
  veryRecent: {
    dot: "bg-emerald-500 dark:bg-emerald-400",
    text: "font-medium text-emerald-700 dark:text-emerald-300",
  },
  recent: {
    dot: "bg-emerald-300 dark:bg-emerald-700",
    text: "text-emerald-700/80 dark:text-emerald-300/80",
  },
  old: { dot: "", text: "" },
};

function getTier(updatedAt: Date | string): Tier {
  if (isRecent(updatedAt, 1)) return "veryRecent";
  if (isRecent(updatedAt, 24)) return "recent";
  return "old";
}

export function LastUpdated({ updatedAt, updatedBy, timezone, hideUser, className }: Props) {
  if (!updatedAt) return null;
  const tier = getTier(updatedAt);
  const { dot, text } = TIER_CLASSES[tier];
  const relative = formatRelativeTime(updatedAt, timezone);
  const absolute = formatAbsoluteTime(updatedAt, timezone);
  const who = !hideUser && updatedBy ? (updatedBy.name || updatedBy.email) : null;

  return (
    <span
      title={absolute}
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ${className ?? ""}`}
    >
      {tier !== "old" && (
        <span
          aria-label="Recently updated"
          className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`}
        />
      )}
      <span>
        Updated <span className={text}>{relative}</span>
        {who && (
          <>
            {" by "}
            <span className="text-gray-600 dark:text-gray-300">{who}</span>
          </>
        )}
      </span>
    </span>
  );
}
