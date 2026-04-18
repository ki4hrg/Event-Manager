import { notFound } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getFunctionsForTable, duplicateFunction, deleteFunction, deleteFunctions } from "../../functions/actions";
import { FunctionList } from "../../functions/FunctionList";
import { getOptions } from "@/app/settings/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function EventFunctionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, functions, functionTypes] = await Promise.all([
    getEvent(id),
    getFunctionsForTable(id),
    getOptions("function_type"),
  ]);

  if (!event) {
    notFound();
  }

  const workflowSummaries = functions.length > 0
    ? await getWorkflowBadgeSummaries("function", functions.map((f) => f.id))
    : {};

  const duplicateFunctionAction = async (functionId: string) => {
    "use server";
    await duplicateFunction(functionId, id);
  };

  const deleteFunctionAction = async (functionId: string) => {
    "use server";
    await deleteFunction(functionId, id);
  };

  const deleteFunctionsAction = async (ids: string[]) => {
    "use server";
    await deleteFunctions(ids, id);
  };

  return (
    <PageWrapper>
      <div className="flex justify-between items-center mb-4">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${id}` },
            { label: "Function List" },
          ]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
      </div>

      <EventTabs eventId={id} />

      <FunctionList
        functions={functions}
        eventId={id}
        timezone={event.timezone || "America/Chicago"}
        functionTypes={functionTypes}
        workflowSummaries={workflowSummaries}
        duplicateFunction={duplicateFunctionAction}
        deleteFunction={deleteFunctionAction}
        deleteFunctions={deleteFunctionsAction}
      />
    </PageWrapper>
  );
}
