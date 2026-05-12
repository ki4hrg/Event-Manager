import { DetailTabs } from "@/components/DetailTabs";

export const PRINT_ORDER_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Vendors", value: "vendors" },
  { label: "Files", value: "files" },
] as const;

type PrintOrderTabsProps = {
  basePath: string;
  activeTab: string;
};

export function PrintOrderTabs({ basePath, activeTab }: PrintOrderTabsProps) {
  return <DetailTabs tabs={[...PRINT_ORDER_TABS]} basePath={basePath} activeTab={activeTab} />;
}
