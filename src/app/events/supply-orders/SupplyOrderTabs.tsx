import { DetailTabs } from "@/components/DetailTabs";

export const SUPPLY_ORDER_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Vendors", value: "vendors" },
  { label: "Files", value: "files" },
] as const;

type SupplyOrderTabsProps = {
  basePath: string;
  activeTab: string;
};

export function SupplyOrderTabs({ basePath, activeTab }: SupplyOrderTabsProps) {
  return <DetailTabs tabs={[...SUPPLY_ORDER_TABS]} basePath={basePath} activeTab={activeTab} />;
}
