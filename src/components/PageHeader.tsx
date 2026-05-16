import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

type Props = {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ breadcrumbs, title, description, actions }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-6">
      <div className="min-w-0">
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <h1 className={`text-2xl font-semibold text-gray-900 dark:text-white${breadcrumbs ? " mt-1" : ""}`}>
          {title}
        </h1>
        {description && (
          <p className="text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}
