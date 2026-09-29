import Link from "next/link";
import type { DashboardChoice } from "@/components/ShareReportButton";

type Props = {
  eventId: string;
  addToDashboardId: string | undefined;
  dashboardChoices: DashboardChoice[];
};

export function AddToDashboardBanner({ eventId, addToDashboardId, dashboardChoices }: Props) {
  if (!addToDashboardId) return null;
  const dashboard = dashboardChoices.find((d) => d.id === addToDashboardId);
  if (!dashboard) return null;
  const name = dashboard.label || "Untitled dashboard";
  return (
    <div className="mb-4 print:hidden rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-start gap-3">
      <div className="flex-1 text-sm">
        <p className="font-medium text-blue-900 dark:text-blue-100">
          Adding a report to dashboard: {name}
        </p>
      </div>
      <Link
        href={`/events/${eventId}/share-links/dashboards/${dashboard.id}`}
        className="text-xs text-blue-700 dark:text-blue-300 hover:underline shrink-0 pt-0.5"
      >
        Cancel
      </Link>
    </div>
  );
}
