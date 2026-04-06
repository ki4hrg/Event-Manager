import { PageWrapper } from "@/components/PageWrapper";
import Link from "next/link";
import { createVendor } from "../actions";
import { getOptions } from "@/app/settings/actions";
import { VendorForm } from "../VendorForm";

export const dynamic = "force-dynamic";

export default async function NewVendorPage() {
  const vendorTypes = await getOptions("vendor_type");

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href="/vendors"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Vendors
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Vendor
        </h1>
      </div>

      <div className="max-w-lg">
        <VendorForm vendorTypes={vendorTypes} action={createVendor} />
      </div>
    </PageWrapper>
  );
}
