import { requireAdmin } from "@/lib/auth";
import { PageWrapper } from "@/components/PageWrapper";
import { SettingsTabs } from "./SettingsTabs";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure dropdown options and system preferences
        </p>
      </div>
      <SettingsTabs />
      {children}
    </PageWrapper>
  );
}
