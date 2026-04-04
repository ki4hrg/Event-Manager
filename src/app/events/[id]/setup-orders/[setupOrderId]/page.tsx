import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getSetupOrder,
  updateSetupOrder,
  deleteSetupOrder,
  linkSetupOrderToFunction,
  unlinkSetupOrderFromFunction,
  createSetupTable,
  updateSetupTable,
  deleteSetupTable,
  createSetupEquipmentItem,
  updateSetupEquipmentItem,
  deleteSetupEquipmentItem,
} from "../../../setup-orders/actions";
import { getOptions, getEquipment } from "@/app/settings/actions";
import { SetupOrderForm } from "../../../setup-orders/SetupOrderForm";
import { SetupTableList } from "../../../setup-orders/SetupTableList";
import { EquipmentTable } from "../../../beos/EquipmentTable";
import { AVOrderLinkPanel } from "../../../av-orders/AVOrderLinkPanel";

export const dynamic = "force-dynamic";

export default async function SetupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; setupOrderId: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id: eventId, setupOrderId } = await params;

  const [event, setupOrder, setupTypes, responsiblePartyOptions, equipmentOptions, equipmentCategories] =
    await Promise.all([
      getEvent(eventId),
      getSetupOrder(setupOrderId),
      getOptions("setup_type"),
      getOptions("responsible_party"),
      getEquipment(),
      getOptions("equipment_category"),
    ]);

  if (!event || !setupOrder) {
    notFound();
  }

  const TABLE_CAT = "TABLES";
  const CHAIR_CAT = "CHAIRS";
  const tableOptions = equipmentOptions.filter((e) => e.category === TABLE_CAT);
  const chairOptions = equipmentOptions.filter((e) => e.category === CHAIR_CAT);
  const otherEquipment = equipmentOptions.filter((e) => e.category !== TABLE_CAT && e.category !== CHAIR_CAT);
  const otherCategories = equipmentCategories.filter((c) => c.value !== TABLE_CAT && c.value !== CHAIR_CAT);

  const availableFunctions = setupOrder.functionId
    ? []
    : await prisma.function.findMany({
        where: { eventId, setupOrder: null },
        orderBy: { name: "asc" },
      });

  const updateSetupOrderAction = async (formData: FormData) => {
    "use server";
    await updateSetupOrder(setupOrderId, eventId, formData);
  };

  const deleteSetupOrderAction = async () => {
    "use server";
    await deleteSetupOrder(setupOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkSetupOrderToFunction(setupOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async () => {
    "use server";
    await unlinkSetupOrderFromFunction(setupOrderId, eventId);
  };

  const createTableAction = async (formData: FormData) => {
    "use server";
    await createSetupTable(setupOrderId, eventId, formData);
  };

  const updateTableAction = async (id: string, formData: FormData) => {
    "use server";
    await updateSetupTable(id, setupOrderId, eventId, formData);
  };

  const deleteTableAction = async (id: string) => {
    "use server";
    await deleteSetupTable(id, setupOrderId, eventId);
  };

  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createSetupEquipmentItem(setupOrderId, eventId, formData);
  };

  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateSetupEquipmentItem(id, setupOrderId, eventId, formData);
  };

  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteSetupEquipmentItem(id, setupOrderId, eventId);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Setup Orders", href: `/events/${eventId}/setup-orders` },
              { label: setupOrder.name },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {setupOrder.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteSetupOrderAction}
          confirmMessage="Are you sure you want to delete this Setup Order?"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <SetupOrderForm
            setupOrder={setupOrder}
            eventId={eventId}
            setupTypes={setupTypes}
            action={updateSetupOrderAction}
          />
          <AVOrderLinkPanel
            title="Linked Function"
            linkedId={setupOrder.functionId}
            linkedName={setupOrder.function?.name ?? null}
            linkedDetailPath={
              setupOrder.function
                ? `/events/${eventId}/functions/${setupOrder.function.id}`
                : null
            }
            availableItems={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
            newItemPath={`/events/${eventId}`}
            linkItem={linkToFunctionAction}
            unlinkItem={unlinkFromFunctionAction}
            entityLabel="function"
          />
        </div>

        <div className="space-y-8">
          <SetupTableList
            tables={setupOrder.tables}
            tableOptions={tableOptions}
            chairOptions={chairOptions}
            createTable={createTableAction}
            updateTable={updateTableAction}
            deleteTable={deleteTableAction}
          />
          <EquipmentTable
            items={setupOrder.equipmentItems}
            responsiblePartyOptions={responsiblePartyOptions}
            equipmentOptions={otherEquipment}
            equipmentCategories={otherCategories}
            createItem={createEquipmentAction}
            updateItem={updateEquipmentAction}
            deleteItem={deleteEquipmentAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}
