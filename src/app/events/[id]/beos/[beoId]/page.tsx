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
  createTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  createBEOLineItem,
  updateBEOLineItem,
  deleteBEOLineItem,
  createBEOMenuSection,
  updateBEOMenuSection,
  deleteBEOMenuSection,
  addBEOContact,
  updateBEOContact,
  removeBEOContact,
  searchContactsForBEO,
} from "../../../beos/actions";
import { getOptions } from "../../../../settings/actions";
import { BEOForm } from "../../../beos/BEOForm";
import { TimelineTable } from "../../../beos/TimelineTable";
import { EquipmentTable } from "../../../beos/EquipmentTable";
import { LineItemTable } from "../../../beos/LineItemTable";
import { MenuSectionTable } from "../../../beos/MenuSectionTable";
import { ContactList } from "../../../functions/ContactList";
import { AVOrderLinkPanel } from "../../../av-orders/AVOrderLinkPanel";

export const dynamic = "force-dynamic";

export default async function BEOPage({
  params,
}: {
  params: Promise<{ id: string; beoId: string }>;
}) {
  const { id: eventId, beoId } = await params;
  const [event, beo, serviceStyleOptions, cateringProviderOptions, allAvailableFunctions] = await Promise.all([
    getEvent(eventId),
    getBEO(beoId),
    getOptions("service_style"),
    getOptions("catering_provider"),
    prisma.function.findMany({ where: { eventId, beo: null }, orderBy: { name: "asc" } }),
  ]);

  if (!event || !beo) {
    notFound();
  }

  const availableFunctions = beo.functionId ? [] : allAvailableFunctions;

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

  // Timeline
  const createTimelineAction = async (formData: FormData) => {
    "use server";
    await createTimelineItem(beoId, eventId, formData);
  };
  const updateTimelineAction = async (id: string, formData: FormData) => {
    "use server";
    await updateTimelineItem(id, beoId, eventId, formData);
  };
  const deleteTimelineAction = async (id: string) => {
    "use server";
    await deleteTimelineItem(id, beoId, eventId);
  };

  // Equipment
  const createEquipmentAction = async (formData: FormData) => {
    "use server";
    await createEquipmentItem(beoId, eventId, formData);
  };
  const updateEquipmentAction = async (id: string, formData: FormData) => {
    "use server";
    await updateEquipmentItem(id, beoId, eventId, formData);
  };
  const deleteEquipmentAction = async (id: string) => {
    "use server";
    await deleteEquipmentItem(id, beoId, eventId);
  };

  // Line Items
  const createLineItemAction = async (formData: FormData) => {
    "use server";
    await createBEOLineItem(beoId, eventId, formData);
  };
  const updateLineItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateBEOLineItem(id, beoId, eventId, formData);
  };
  const deleteLineItemAction = async (id: string) => {
    "use server";
    await deleteBEOLineItem(id, beoId, eventId);
  };

  // Menu Sections
  const createMenuSectionAction = async (formData: FormData) => {
    "use server";
    await createBEOMenuSection(beoId, eventId, formData);
  };
  const updateMenuSectionAction = async (id: string, formData: FormData) => {
    "use server";
    await updateBEOMenuSection(id, beoId, eventId, formData);
  };
  const deleteMenuSectionAction = async (id: string) => {
    "use server";
    await deleteBEOMenuSection(id, beoId, eventId);
  };

  // Contacts
  const addContactAction = async (formData: FormData) => {
    "use server";
    await addBEOContact(beoId, eventId, formData);
  };
  const updateContactAction = async (id: string, formData: FormData) => {
    "use server";
    await updateBEOContact(id, beoId, eventId, formData);
  };
  const removeContactAction = async (id: string) => {
    "use server";
    await removeBEOContact(id, beoId, eventId);
  };
  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContactsForBEO(query);
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

      <div className="space-y-8">
        {/* BEO form + Function link */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <BEOForm
            beo={beo}
            eventId={eventId}
            action={updateBEOAction}
            serviceStyleOptions={serviceStyleOptions}
          />
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
            <ContactList
              contacts={beo.contacts}
              addContact={addContactAction}
              updateContact={updateContactAction}
              removeContact={removeContactAction}
              searchContacts={searchContactsAction}
            />
          </div>
        </div>

        {/* Menu Sections */}
        <MenuSectionTable
          sections={beo.menuSections}
          cateringProviderOptions={cateringProviderOptions}
          createSection={createMenuSectionAction}
          updateSection={updateMenuSectionAction}
          deleteSection={deleteMenuSectionAction}
        />

        {/* Timeline */}
        <TimelineTable
          items={beo.timelineItems}
          createItem={createTimelineAction}
          updateItem={updateTimelineAction}
          deleteItem={deleteTimelineAction}
        />

        {/* Equipment */}
        <EquipmentTable
          items={beo.equipmentItems}
          createItem={createEquipmentAction}
          updateItem={updateEquipmentAction}
          deleteItem={deleteEquipmentAction}
        />

        {/* Pricing */}
        <LineItemTable
          items={beo.lineItems}
          createItem={createLineItemAction}
          updateItem={updateLineItemAction}
          deleteItem={deleteLineItemAction}
        />
      </div>
    </PageWrapper>
  );
}
