import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "@/app/events/event";
import { createCateringOrder } from "../../../catering-orders/actions";
import { getOptions } from "@/app/settings/actions";
import { CateringOrderForm } from "../../../catering-orders/CateringOrderForm";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { requirePermission } from "@/lib/permissions";
import { formatFunctionLabel } from "@/lib/functionNumbers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New catering order" };

export default async function NewCateringOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const { functionId } = await searchParams;

  const [event, serviceStyleOptions, responsiblePartyVendors, eventFunctions, mealTypeOptions] = await Promise.all([
    getEvent(eventId),
    getOptions("service_style"),
    getResponsiblePartyVendors(eventId, "CATERING_ORDER"),
    prisma.function.findMany({
      where: { eventId, cateringOrder: null },
      select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    getOptions("meal_type"),
  ]);

  if (!event) {
    notFound();
  }

  const createCateringOrderAction = async (formData: FormData) => {
    "use server";
    await createCateringOrder(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}/catering-orders`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Catering Orders
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Catering Order
        </h1>
      </div>

      <CateringOrderForm
        eventId={eventId}
        action={createCateringOrderAction}
        serviceStyleOptions={serviceStyleOptions}
        mealTypeOptions={mealTypeOptions}
        responsiblePartyOptions={responsiblePartyVendors}
        createFunctions={eventFunctions.map((f) => ({ id: f.id, label: formatFunctionLabel(f) }))}
        defaultFunctionId={functionId}
      />
    </>
  );

}
