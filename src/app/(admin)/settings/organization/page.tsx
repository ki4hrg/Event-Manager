import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Toast } from "@/components/Toast";
import { PageHeader } from "@/components/PageHeader";
import { getOrganizationProfile, updateOrganizationProfile } from "../actions";
import { OrganizationForm } from "./OrganizationForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Organization" };

export default async function SettingsOrganizationPage() {
  const org = await getOrganizationProfile();
  if (!org) notFound();

  return (
    <div className="max-w-3xl">
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader title="Organization" />
      {/* Keyed on updatedAt so a save remounts the form back into view mode. */}
      <OrganizationForm key={org.updatedAt.toISOString()} org={org} saveAction={updateOrganizationProfile} />
    </div>
  );
}
