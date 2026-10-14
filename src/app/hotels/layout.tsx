import { requirePermission } from "@/lib/permissions";

export default async function HotelsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("HOTELS", "VIEW");
  return <>{children}</>;
}
