import { DetailTabs } from "@/components/DetailTabs";

export const MEDIA_DELIVERABLE_TABS = [
  { label: "Overview", value: "overview" },
  { label: "Files", value: "files" },
] as const;

type MediaDeliverableTabsProps = {
  basePath: string;
  activeTab: string;
};

export function MediaDeliverableTabs({ basePath, activeTab }: MediaDeliverableTabsProps) {
  return <DetailTabs tabs={[...MEDIA_DELIVERABLE_TABS]} basePath={basePath} activeTab={activeTab} />;
}
