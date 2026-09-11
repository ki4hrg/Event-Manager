"use client";

import Link from "next/link";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useState, useEffect, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { EventKeyStaff, Contact } from "@prisma/client";
import { MODEL_TYPES, MODEL_LABELS } from "@/app/vendors/model-types";
import { formatPhone } from "@/lib/formatPhone";
import { useCanWrite } from "@/components/PermissionsProvider";

type KeyStaffWithContact = EventKeyStaff & { contact: Contact };

type KeyStaffListProps = {
  keyStaff: KeyStaffWithContact[];
  addKeyStaff: (formData: FormData) => Promise<void>;
  updateKeyStaff: (id: string, formData: FormData) => Promise<void>;
  removeKeyStaff: (id: string) => Promise<void>;
  searchContacts: (query: string) => Promise<Contact[]>;
  createContact?: (formData: FormData) => Promise<void>;
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

function ModelCheckboxes({ defaultValues = [] }: { defaultValues?: string[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        Model links for this event staff entry
      </label>
      <div className="flex flex-wrap gap-3">
        {MODEL_TYPES.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="models"
              value={value}
              defaultChecked={defaultValues.includes(value)}
              className="rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
      {children}
    </p>
  );
}

export function KeyStaffList({
  keyStaff,
  addKeyStaff,
  updateKeyStaff,
  removeKeyStaff,
  searchContacts,
  createContact,
}: KeyStaffListProps) {
  const canWrite = useCanWrite("EVENTS");
  const [formView, setFormView] = useState<"hidden" | "search" | "create">("hidden");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchContacts(searchQuery);
        setSearchResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchContacts]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSearchQuery("");
    setSearchResults([]);
  };

  const closeAddForm = () => {
    setFormView("hidden");
    setSelectedContact(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleAddFormSubmit = async (formData: FormData) => {
    if (!selectedContact) return;
    formData.set("contactId", selectedContact.id);
    await addKeyStaff(formData);
    closeAddForm();
  };

  const handleCreateFormSubmit = async (formData: FormData) => {
    if (!createContact) return;
    await createContact(formData);
    closeAddForm();
  };

  const handleUpdateSubmit = async (id: string, formData: FormData) => {
    await updateKeyStaff(id, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Key Staff
        </p>
        {canWrite && (
          <button
            onClick={() => {
              setSelectedContact(null);
              setSearchQuery("");
              setFormView("search");
            }}
            className={btnPrimarySm}
          >
            Add
          </button>
        )}
      </div>

      {formView === "search" && (
        <form action={handleAddFormSubmit} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
          {!selectedContact ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search Contacts *
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or organization..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
              {isSearching && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md max-h-40 overflow-y-auto">
                  {searchResults.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleSelectContact(contact)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                    >
                      <span className="text-gray-900 dark:text-white font-medium">
                        {contact.firstName} {contact.lastName}
                      </span>
                      {contact.organization && (
                        <span className="text-gray-500 dark:text-gray-400"> - {contact.organization}</span>
                      )}
                      {contact.email && (
                        <span className="text-gray-400 dark:text-gray-500 block text-xs">{contact.email}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No contacts found.{" "}
                  {createContact ? (
                    <button
                      type="button"
                      onClick={() => setFormView("create")}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Create new contact
                    </button>
                  ) : (
                    <Link href="/contacts/new" className="text-blue-600 dark:text-blue-400 hover:underline">
                      Create a new contact
                    </Link>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Selected Contact
              </label>
              <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <span className="text-gray-900 dark:text-white text-sm">
                  {selectedContact.firstName} {selectedContact.lastName}
                  {selectedContact.organization && (
                    <span className="text-gray-500 dark:text-gray-400"> - {selectedContact.organization}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              name="title"
              placeholder="e.g. Logistics Team Lead, Communications Lead..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <ModelCheckboxes />

          <div className="flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={closeAddForm}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {formView === "create" && (
        <form action={handleCreateFormSubmit} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
          <div className="space-y-3">
            <SectionLabel>New contact</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="firstName"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="lastName"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization
              </label>
              <input
                type="text"
                name="organization"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>
          <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <SectionLabel>Event staff entry</SectionLabel>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title
              </label>
              <input
                type="text"
                name="title"
                placeholder="e.g. Logistics Team Lead, Communications Lead..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <ModelCheckboxes />
          </div>
          <div className="flex gap-2 pt-1">
            <SubmitButton label="Create & Add" />
            <button
              type="button"
              onClick={() => setFormView("search")}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Back
            </button>
            <button
              type="button"
              onClick={closeAddForm}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {keyStaff.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None added.</p>
      ) : (
        <div className="space-y-2">
          {keyStaff.map((entry) => (
            <div key={entry.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === entry.id ? (
                <form
                  action={(formData) => handleUpdateSubmit(entry.id, formData)}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      name="title"
                      defaultValue={entry.title ?? ""}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <ModelCheckboxes defaultValues={entry.models} />
                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {entry.contact.firstName} {entry.contact.lastName}
                    </span>
                    {entry.title && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{entry.title}</p>
                    )}
                    {entry.contact.phone && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{formatPhone(entry.contact.phone)}</p>
                    )}
                    {entry.models.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {entry.models.map((m) => (
                          <span
                            key={m}
                            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                          >
                            {MODEL_LABELS[m] ?? m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        onClick={() => setEditingId(entry.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Remove this key staff entry?")) {
                            await removeKeyStaff(entry.id);
                          }
                        }}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Remove
                      </button>
                    </div>
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
