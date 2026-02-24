import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getBEO,
  updateBEO,
  deleteBEO,
  linkBEOToFunction,
  unlinkBEOFromFunction,
} from "../../../beos/actions";
import { BEOForm } from "../../../beos/BEOForm";
import { AVOrderLinkPanel } from "../../../av-orders/AVOrderLinkPanel";

export const dynamic = "force-dynamic";

export default async function BEOPage({
  params,
}: {
  params: Promise<{ id: string; beoId: string }>;
}) {
  const { id: eventId, beoId } = await params;
  const [event, beo] = await Promise.all([
    getEvent(eventId),
    getBEO(beoId),
  ]);

  if (!event || !beo) {
    notFound();
  }

  const availableFunctions = beo.functionId
    ? []
    : await prisma.function.findMany({
        where: { eventId, beo: null },
        orderBy: { name: "asc" },
      });

  const updateBEOAction = async (formData: FormData) => {
    "use server";
    await updateBEO(beoId, eventId, formData);
  };

  const deleteBEOAction = async () => {
    "use server";
    await deleteBEO(beoId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkBEOToFunction(beoId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async () => {
    "use server";
    await unlinkBEOFromFunction(beoId, eventId);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href={`/events/${eventId}/beos`}
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            &larr; Back to BEOs
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {beo.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteBEOAction}
          confirmMessage="Are you sure you want to delete this BEO?"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <BEOForm beo={beo} eventId={eventId} action={updateBEOAction} />
        </div>

        <div className="space-y-6">
          <AVOrderLinkPanel
            title="Linked Function"
            linkedId={beo.functionId}
            linkedName={beo.function?.name ?? null}
            linkedDetailPath={
              beo.functionId ? `/events/${eventId}/functions/${beo.functionId}` : null
            }
            availableItems={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
            newItemPath={`/events/${eventId}/beos/new`}
            linkItem={linkToFunctionAction}
            unlinkItem={unlinkFromFunctionAction}
            entityLabel="function"
          />
        </div>
      </div>
    </PageWrapper>
  );
}
