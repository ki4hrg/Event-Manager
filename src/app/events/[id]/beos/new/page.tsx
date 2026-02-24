import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { createBEO } from "../../../beos/actions";
import { BEOForm } from "../../../beos/BEOForm";

export const dynamic = "force-dynamic";

export default async function NewBEOPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId } = await searchParams;

  const event = await getEvent(eventId);

  if (!event) {
    notFound();
  }

  const createBEOAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    await createBEO(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}/beos`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to BEOs
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New BEO
        </h1>
      </div>

      <BEOForm eventId={eventId} action={createBEOAction} />
    </PageWrapper>
  );
}
