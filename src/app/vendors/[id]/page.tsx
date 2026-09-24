import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/tenant";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import {
  getVendor,
  updateVendor,
  deleteVendor,
  searchContactsForVendor,
  addVendorContact,
  updateVendorContact,
  removeVendorContact,
  createAndAddVendorContact,
} from "../actions";
import { getOptions } from "@/app/settings/actions";
import { VendorForm } from "../VendorForm";
import { MODEL_LABELS } from "../model-types";
import { VendorContactList } from "../VendorContactList";
import { LastUpdated } from "@/components/LastUpdated";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vendor = await prisma.vendor.findFirst({
    where: { id, tenantId: (await getActiveTenantId()) ?? "" },
    select: { name: true },
  });
  return { title: vendor?.name ?? "Vendor" };
}

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendor, contactTypes] = await Promise.all([
    getVendor(id),
    getOptions("vendor_contact_type"),
  ]);

  if (!vendor) {
    notFound();
  }

  const updateVendorAction = async (formData: FormData) => {
    "use server";
    await updateVendor(id, formData);
  };

  const deleteVendorAction = async () => {
    "use server";
    await deleteVendor(id);
  };

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContactsForVendor(query);
  };

  const addContactAction = async (formData: FormData) => {
    "use server";
    await addVendorContact(id, formData);
  };

  const updateContactAction = async (contactId: string, formData: FormData) => {
    "use server";
    await updateVendorContact(contactId, id, formData);
  };

  const removeContactAction = async (contactId: string) => {
    "use server";
    await removeVendorContact(contactId, id);
  };

  const createContactAction = async (formData: FormData) => {
    "use server";
    await createAndAddVendorContact(id, formData);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>

      <PageHeader
        breadcrumbs={[{ label: "Vendors", href: "/vendors" }, { label: vendor.name }]}
        title={vendor.name}
        meta={<LastUpdated updatedAt={vendor.updatedAt} updatedBy={vendor.updatedBy} />}
        actions={!vendor.isSystemVendor ? <DeleteButton resource="VENDORS" action={deleteVendorAction} /> : undefined}
      />
      {vendor.models.length > 0 && (
        <div className="flex flex-wrap gap-1 -mt-4 mb-6">
          {vendor.models.map((model) => (
            <span
              key={model}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
            >
              {MODEL_LABELS[model] || model}
            </span>
          ))}
        </div>
      )}

      {vendor.isSystemVendor ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 max-w-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This is a system vendor and cannot be edited.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 min-w-0">
            <VendorForm vendor={vendor} action={updateVendorAction} />
          </div>

          <div className="lg:col-span-2 min-w-0">
            <VendorContactList
              contacts={vendor.contacts}
              contactTypes={contactTypes}
              addContact={addContactAction}
              updateContact={updateContactAction}
              removeContact={removeContactAction}
              searchContacts={searchContactsAction}
              createContact={createContactAction}
            />
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
