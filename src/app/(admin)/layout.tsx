import { AdminShell } from "@/components/AdminShell";

export const dynamic = "force-dynamic";

// One shell for every admin segment (settings, system, users, workflows,
// tenants), so moving between them keeps the nav mounted. Grants nothing:
// each segment's layout.tsx gates its own entry.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
