import Link from "next/link";

type Props = {
  eventId: string;
  dashboardId: string;
  dashboardLabel: string | null;
};

export function AddToDashboardBanner({ eventId, dashboardId, dashboardLabel }: Props) {
  const name = dashboardLabel || "Untitled dashboard";
  return (
    <div className="mb-4 print:hidden rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 text-sm">
        <p className="font-medium text-blue-900 dark:text-blue-100">
          Adding a report to dashboard: {name}
        </p>
        <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
          Set the filters you want recipients to see, then click the{" "}
          <span className="font-medium">Add to {name}</span> button.
        </p>
      </div>
      <Link
        href={`/events/${eventId}/share-links/dashboards/${dashboardId}`}
        className="text-xs text-blue-700 dark:text-blue-300 hover:underline shrink-0 pt-0.5"
      >
        Cancel
      </Link>
    </div>
  );
}
