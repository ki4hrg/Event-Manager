"use client";

import Link from "next/link";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useState, useEffect } from "react";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { useFormStatus } from "react-dom";
import type { VendorContact, Contact, CustomOption } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";

type VendorContactWithContact = VendorContact & { contact: Contact };

type VendorContactListProps = {
  contacts: VendorContactWithContact[];
  contactTypes: CustomOption[];
  addContact: (formData: FormData) => Promise<void>;
  updateContact: (contactId: string, formData: FormData) => Promise<void>;
  removeContact: (contactId: string) => Promise<void>;
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

function ContactTypeField({
  contactTypes,
  defaultValue,
}: {
  contactTypes: CustomOption[];
  defaultValue?: string;
}) {
  if (contactTypes.length > 0) {
    return (
      <select
        name="contactType"
        defaultValue={defaultValue ?? ""}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
      >
        <option value="">— None —</option>
        {contactTypes.map((t) => (
          <option key={t.id} value={t.label}>
            {t.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      name="contactType"
      defaultValue={defaultValue ?? ""}
      placeholder="e.g. Sales, Billing..."
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    />
  );
}

export function VendorContactList({
  contacts,
  contactTypes,
  addContact,
  updateContact,
  removeContact,
  searchContacts,
  createContact,
}: VendorContactListProps) {
  const canWrite = useCanWrite("VENDORS");
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
        const existingContactIds = new Set(contacts.map((c) => c.contactId));
        setSearchResults(results.filter((c) => !existingContactIds.has(c.id)));
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchContacts, contacts]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSearchQuery("");
    setSearchResults([]);
  };

  const closeForm = () => {
    setFormView("hidden");
    setSelectedContact(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleAddFormSubmit = async (formData: FormData) => {
    if (!selectedContact) return;
    formData.set("contactId", selectedContact.id);
    await addContact(formData);
    closeForm();
  };

  const handleCreateFormSubmit = async (formData: FormData) => {
    if (!createContact) return;
    await createContact(formData);
    closeForm();
  };

  const handleUpdateSubmit = async (contactId: string, formData: FormData) => {
    await updateContact(contactId, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Contacts</h2>
        {canWrite && (
          <button
            onClick={() => {
              setSelectedContact(null);
              setSearchQuery("");
              setFormView("search");
            }}
            className={btnPrimarySm}
          >
            Add Contact
          </button>
        )}
      </div>

      {formView === "search" && (
        <form action={handleAddFormSubmit} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="space-y-4">
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
                          <span className="text-gray-400 dark:text-gray-500 block text-xs">
                            {contact.email}
                          </span>
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
                  <span className="text-gray-900 dark:text-white">
                    {selectedContact.firstName} {selectedContact.lastName}
                    {selectedContact.organization && (
                      <span className="text-gray-500 dark:text-gray-400"> - {selectedContact.organization}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Type
              </label>
              <ContactTypeField contactTypes={contactTypes} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" name="isPrimary" value="true" className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500" />
              Primary contact
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <SubmitButton label="Add Contact" />
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {formView === "create" && (
        <form action={handleCreateFormSubmit} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="space-y-3">
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
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contact Type
              </label>
              <ContactTypeField contactTypes={contactTypes} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" name="isPrimary" value="true" className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500" />
              Primary contact
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <SubmitButton label="Create & Add" />
            <button
              type="button"
              onClick={() => setFormView("search")}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Back
            </button>
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No contacts assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <form
                  action={(formData) => handleUpdateSubmit(item.id, formData)}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Contact Type
                    </label>
                    <ContactTypeField contactTypes={contactTypes} defaultValue={item.contactType || ""} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      name="isPrimary"
                      value="true"
                      defaultChecked={item.isPrimary}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                    />
                    Primary contact
                  </label>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-gray-900 dark:text-white font-medium">
                      {item.contact.firstName} {item.contact.lastName}
                    </span>
                    {item.isPrimary && (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                        Primary
                      </span>
                    )}
                    {item.contactType && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {resolveOptionLabel(item.contactType, contactTypes)}
                      </span>
                    )}
                    {item.contact.organization && (
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        ({item.contact.organization})
                      </span>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        onClick={() => setEditingId(item.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Remove this contact?")) {
                            await removeContact(item.id);
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
