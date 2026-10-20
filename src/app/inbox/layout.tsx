import { requirePermission } from "@/lib/permissions";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("HOTELS", "VIEW");
  return <>{children}</>;
}
