import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getFunctionsForTable, duplicateFunction, deleteFunction, deleteFunctions, bulkUpdateFunctions } from "../../functions/actions";
import { FunctionList } from "../../functions/FunctionList";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";

export const dynamic = "force-dynamic";

export default async function EventFunctionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; schedule?: string; room?: string }>;
}) {
  const { id } = await params;
  const { status: initialStatus, schedule: initialSchedule, room: initialRoom } = (await searchParams) ?? {};
  const [event, functions, functionTypes, substatuses] = await Promise.all([
    getEvent(id),
    getFunctionsForTable(id),
    getOptions("function_type"),
    getSubstatusOptions(),
  ]);

  if (!event) {
    notFound();
  }

  const workflowSummaries = functions.length > 0
    ? await getWorkflowBadgeSummaries("function", functions.map((f) => f.id), id)
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

  const bulkUpdateFunctionsAction = async (
    ids: string[],
    updates: { status?: import("@prisma/client").EntityStatus; substatus?: string | null; type?: string }
  ) => {
    "use server";
    await bulkUpdateFunctions(ids, id, updates);
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${id}` },
            { label: "Functions" },
          ]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
      </div>


      <FunctionList
        functions={functions}
        eventId={id}
        timezone={event.timezone || "America/Chicago"}
        functionTypes={functionTypes}
        substatuses={substatuses}
        workflowSummaries={workflowSummaries}
        initialStatus={initialStatus}
        initialSchedule={initialSchedule}
        initialRoom={initialRoom}
        duplicateFunction={duplicateFunctionAction}
        deleteFunction={deleteFunctionAction}
        deleteFunctions={deleteFunctionsAction}
        bulkUpdateFunctions={bulkUpdateFunctionsAction}
      />
    </>
  );

}
