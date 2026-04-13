import { DetailTabs } from "@/components/DetailTabs";

export const SETUP_ORDER_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Vendors", value: "vendors" },
  { label: "Files", value: "files" },
] as const;

type SetupOrderTabsProps = {
  basePath: string;
  activeTab: string;
};

export function SetupOrderTabs({ basePath, activeTab }: SetupOrderTabsProps) {
  return <DetailTabs tabs={[...SETUP_ORDER_TABS]} basePath={basePath} activeTab={activeTab} />;
}
