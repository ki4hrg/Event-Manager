"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CateringOrderMenuSection, Vendor } from "@prisma/client";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ResponsiblePartyField } from "@/components/ResponsiblePartyField";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { isRichTextEmpty } from "@/lib/richText";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type MenuSectionWithVendor = CateringOrderMenuSection & {
  responsiblePartyVendor: Vendor | null;
};

type MenuSectionTableProps = {
  sections: MenuSectionWithVendor[];
  responsiblePartyVendors: ResponsiblePartyOptions;
  createSection: (formData: FormData) => Promise<void>;
  updateSection: (id: string, formData: FormData) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

export function MenuSectionTable({
  sections,
  responsiblePartyVendors,
  createSection,
  updateSection,
  deleteSection,
}: MenuSectionTableProps) {
  const canWrite = useCanWrite("CATERING_ORDERS");
  const canDelete = useCanDelete("CATERING_ORDERS");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuError, setMenuError] = useState(false);

  const handleCreate = async (formData: FormData) => {
    await createSection(formData);
    setShowAddForm(false);
    setMenuError(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateSection(id, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Menu</h2>
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Section
          </button>
        )}
      </div>

      {showAddForm && (
        <form
          action={handleCreate}
          onSubmit={(e) => {
            if (isRichTextEmpty(e.currentTarget, "menuContent")) {
              e.preventDefault();
              setMenuError(true);
            } else {
              setMenuError(false);
            }
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsible Party</label>
            <ResponsiblePartyField options={responsiblePartyVendors} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Menu *</label>
            <RichTextEditor name="menuContent" placeholder="Describe the menu or provisions for this party..." />
            {menuError && <p className="text-xs text-red-600 mt-1">Menu is required.</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              name="notes"
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div className="flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sections.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No menu sections yet.</p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === section.id ? (
                <form
                  action={(fd) => handleUpdate(section.id, fd)}
                  onSubmit={(e) => {
                    if (isRichTextEmpty(e.currentTarget, "menuContent")) {
                      e.preventDefault();
                      setMenuError(true);
                    } else {
                      setMenuError(false);
                    }
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsible Party</label>
                    <ResponsiblePartyField options={responsiblePartyVendors} defaultValue={section.responsiblePartyVendorId} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Menu *</label>
                    <RichTextEditor name="menuContent" defaultValue={section.menuContent} />
                    {menuError && <p className="text-xs text-red-600 mt-1">Menu is required.</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                    <input
                      type="text"
                      name="notes"
                      defaultValue={section.notes || ""}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      {section.responsiblePartyVendor?.name ?? "—"}
                    </span>
                    <div className="flex gap-2 ml-2 shrink-0">
                      {canWrite && (
                        <button onClick={() => setEditingId(section.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Edit</button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (confirm("Delete this menu section?")) await deleteSection(section.id);
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className="text-sm text-gray-900 dark:text-white not-italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                    dangerouslySetInnerHTML={{ __html: section.menuContent }}
                  />
                  {section.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{section.notes}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
