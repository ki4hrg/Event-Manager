import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

type Props = {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ breadcrumbs, title, description, actions }: Props) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <h1 className={`text-2xl font-semibold text-gray-900 dark:text-white${breadcrumbs ? " mt-1" : ""}`}>
          {title}
        </h1>
        {description && (
          <p className="text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
