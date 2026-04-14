import { DetailTabs } from "@/components/DetailTabs";

export const AV_ORDER_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Audio", value: "audio" },
  { label: "Video", value: "video" },
  { label: "Vendors", value: "vendors" },
  { label: "Files", value: "files" },
] as const;

type AVOrderTabsProps = {
  basePath: string;
  activeTab: string;
};

export function AVOrderTabs({ basePath, activeTab }: AVOrderTabsProps) {
  return <DetailTabs tabs={[...AV_ORDER_TABS]} basePath={basePath} activeTab={activeTab} />;
}
