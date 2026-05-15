import { DetailTabs } from "@/components/DetailTabs";

export const MEDIA_ORDER_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Vendors", value: "vendors" },
  { label: "Files", value: "files" },
] as const;

type MediaOrderTabsProps = {
  basePath: string;
  activeTab: string;
};

export function MediaOrderTabs({ basePath, activeTab }: MediaOrderTabsProps) {
  return <DetailTabs tabs={[...MEDIA_ORDER_TABS]} basePath={basePath} activeTab={activeTab} />;
}
