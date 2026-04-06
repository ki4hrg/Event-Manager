import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
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
} from "../actions";
import { getOptions } from "@/app/settings/actions";
import { VendorForm } from "../VendorForm";
import { VendorContactList } from "../VendorContactList";

export const dynamic = "force-dynamic";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendor, vendorTypes, contactTypes] = await Promise.all([
    getVendor(id),
    getOptions("vendor_type"),
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

  const typeLabels = new Map(vendorTypes.map((t) => [t.value, t.label]));

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>

      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href="/vendors"
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            &larr; Back to Vendors
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {vendor.name}
          </h1>
          {vendor.types.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {vendor.types.map((type) => (
                <span
                  key={type}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                >
                  {typeLabels.get(type) || type}
                </span>
              ))}
            </div>
          )}
        </div>
        <DeleteButton
          action={deleteVendorAction}
          confirmMessage="Are you sure you want to delete this vendor?"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <VendorForm vendor={vendor} vendorTypes={vendorTypes} action={updateVendorAction} />
        </div>

        <div>
          <VendorContactList
            contacts={vendor.contacts}
            contactTypes={contactTypes}
            addContact={addContactAction}
            updateContact={updateContactAction}
            removeContact={removeContactAction}
            searchContacts={searchContactsAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
