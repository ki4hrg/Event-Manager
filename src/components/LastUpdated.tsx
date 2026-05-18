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

export function LastUpdated({ updatedAt, updatedBy, timezone, hideUser, className }: Props) {
  if (!updatedAt) return null;
  const recent = isRecent(updatedAt, 24);
  const relative = formatRelativeTime(updatedAt);
  const absolute = formatAbsoluteTime(updatedAt, timezone);
  const who = !hideUser && updatedBy ? (updatedBy.name || updatedBy.email) : null;

  return (
    <span
      title={absolute}
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ${className ?? ""}`}
    >
      {recent && (
        <span
          aria-label="Updated in the last 24 hours"
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400"
        />
      )}
      <span>
        Updated <span className={recent ? "font-medium text-amber-700 dark:text-amber-300" : ""}>{relative}</span>
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
