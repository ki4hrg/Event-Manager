import { DetailTabs } from "@/components/DetailTabs";

export const CATERING_ORDER_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Service", value: "service" },
  { label: "Contract & Billing", value: "contract" },
  { label: "Vendors", value: "vendors" },
  { label: "Files", value: "files" },
] as const;

type CateringOrderTabsProps = {
  basePath: string;
  activeTab: string;
};

export function CateringOrderTabs({ basePath, activeTab }: CateringOrderTabsProps) {
  return <DetailTabs tabs={[...CATERING_ORDER_TABS]} basePath={basePath} activeTab={activeTab} />;
}
