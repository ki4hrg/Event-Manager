"use client";

import { useState } from "react";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import type { SetupOrderDetail } from "@prisma/client";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ResponsiblePartyField } from "@/components/ResponsiblePartyField";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { isRichTextEmpty } from "@/lib/richText";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type DetailWithVendor = SetupOrderDetail & {
  responsiblePartyVendor: { id: string; name: string } | null;
};

type SetupOrderDetailTableProps = {
  details: DetailWithVendor[];
  responsiblePartyVendors: ResponsiblePartyOptions;
  createDetail: (formData: FormData) => Promise<void>;
  updateDetail: (id: string, formData: FormData) => Promise<void>;
  deleteDetail: (id: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimarySm} disabled:opacity-50`}
    >
      {pending ? "..." : label}
    </button>
  );
}

export function SetupOrderDetailTable({
  details,
  responsiblePartyVendors,
  createDetail,
  updateDetail,
  deleteDetail,
}: SetupOrderDetailTableProps) {
  const canWrite = useCanWrite("SETUP_ORDERS");
  const canDelete = useCanDelete("SETUP_ORDERS");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState(false);

  const handleCreate = async (formData: FormData) => {
    await createDetail(formData);
    setShowAddForm(false);
    setDescriptionError(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateDetail(id, formData);
    setEditingId(null);
    setDescriptionError(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Setup Details</h2>
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className={btnPrimarySm}
          >
            Add Detail
          </button>
        )}
      </div>

      {showAddForm && (
        <form
          action={handleCreate}
          onSubmit={(e) => {
            if (isRichTextEmpty(e.currentTarget, "description")) {
              e.preventDefault();
              setDescriptionError(true);
            } else {
              setDescriptionError(false);
            }
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Headline</label>
            <input
              type="text"
              name="headline"
              placeholder="e.g. Stage, Registration Table, Green Room"
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsible Party</label>
            <ResponsiblePartyField options={responsiblePartyVendors} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
            <RichTextEditor name="description" placeholder="Describe the setup..." />
            {descriptionError && <p className="text-xs text-red-600 mt-1">Description is required.</p>}
          </div>
          <div className="flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setDescriptionError(false);
              }}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {details.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No setup details yet.</p>
      ) : (
        <div className="space-y-3">
          {details.map((detail) => (
            <div key={detail.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === detail.id ? (
                <form
                  action={(fd) => handleUpdate(detail.id, fd)}
                  onSubmit={(e) => {
                    if (isRichTextEmpty(e.currentTarget, "description")) {
                      e.preventDefault();
                      setDescriptionError(true);
                    } else {
                      setDescriptionError(false);
                    }
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Headline</label>
                    <input
                      type="text"
                      name="headline"
                      defaultValue={detail.headline ?? ""}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsible Party</label>
                    <ResponsiblePartyField options={responsiblePartyVendors} defaultValue={detail.responsiblePartyVendorId} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
                    <RichTextEditor name="description" defaultValue={detail.description} />
                    {descriptionError && <p className="text-xs text-red-600 mt-1">Description is required.</p>}
                  </div>
                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setDescriptionError(false);
                      }}
                      className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      {detail.headline && (
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
                          {detail.headline}
                        </h3>
                      )}
                      {detail.responsiblePartyVendor && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          By: {detail.responsiblePartyVendor.name}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {canWrite && (
                        <button onClick={() => setEditingId(detail.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Edit</button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (confirm("Delete this setup detail?")) await deleteDetail(detail.id);
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {/* RichTextEditor output — chain: SetupOrderDetailTable → RichTextEditor */}
                  <div
                    className="text-sm text-gray-900 dark:text-white not-italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                    dangerouslySetInnerHTML={{ __html: detail.description }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
