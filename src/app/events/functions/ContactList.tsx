"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type { Contact, PermissionResource } from "@prisma/client";
import { formatPhone } from "@/lib/format-phone";
import { useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import { OptionSelect } from "@/components/ui/OptionSelect";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";

type ContactItem = {
  id: string;
  contactId: string;
  role: string | null;
  contact: Contact;
};

type ContactListProps = {
  contacts: ContactItem[];
  addContact: (formData: FormData) => Promise<void | UserError>;
  updateContact: (id: string, formData: FormData) => Promise<void | UserError>;
  removeContact: (id: string) => Promise<void>;
  searchContacts: (query: string) => Promise<Contact[]>;
  createContact?: (formData: FormData) => Promise<void | UserError>;
  // The option list a contact's role picks from (assignment_role; venue_contact_type on venues).
  roles: string[];
  // Whose write permission the controls follow: the page's own resource.
  resource: PermissionResource;
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

export function ContactList({
  contacts,
  addContact,
  updateContact,
  removeContact,
  searchContacts,
  createContact,
  roles,
  resource,
}: ContactListProps) {
  const canWrite = useCanWrite(resource);
  const [formView, setFormView] = useState<"hidden" | "search" | "create">("hidden");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    // Short queries render no results (see below) instead of clearing state here.
    if (searchQuery.length < 2) return;

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

  const closeAddForm = () => {
    setFormView("hidden");
    setSelectedContact(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleAddFormSubmit = async (formData: FormData) => {
    if (!selectedContact) return { error: "Pick a contact" };
    formData.set("contactId", selectedContact.id);
    return addContact(formData);
  };

  const handleCreateFormSubmit = async (formData: FormData) => {
    if (!createContact) return { error: "Contacts can't be created here" };
    return createContact(formData);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Contacts</h2>
        {canWrite && (
          <button
            onClick={() => {
              setSelectedContact(null);
              setSearchQuery("");
              setFormView("search");
            }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Contact
          </button>
        )}
      </div>

      {formView === "search" && (
        <ActionForm action={handleAddFormSubmit} onDone={closeAddForm} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
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
                {searchQuery.length >= 2 && isSearching && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
                )}
                {searchQuery.length >= 2 && searchResults.length > 0 && (
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
                          <span className="text-gray-500 dark:text-gray-400">
                            {" "}
                            - {contact.organization}
                          </span>
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
                      <span className="text-gray-500 dark:text-gray-400">
                        {" "}
                        - {selectedContact.organization}
                      </span>
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
                Role
              </label>
              <OptionSelect
                name="role"
                options={roles}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          <ActionFormError className="mt-4" />
          <div className="mt-4 flex gap-2">
            <SubmitButton label="Add Contact" />
            <button
              type="button"
              onClick={closeAddForm}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </ActionForm>
      )}

      {formView === "create" && (
        <ActionForm action={handleCreateFormSubmit} onDone={closeAddForm} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                Role
              </label>
              <OptionSelect
                name="role"
                options={roles}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          <ActionFormError className="mt-4" />
          <div className="mt-4 flex gap-2">
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
        </ActionForm>
      )}

      {contacts.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No contacts assigned yet.
        </p>
      ) : (
        <div className="space-y-2">
          {contacts.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <ActionForm
                  action={(formData) => updateContact(item.id, formData)}
                  onDone={() => setEditingId(null)}
                  className="space-y-3"
                >
                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                    {item.contact.firstName} {item.contact.lastName}
                    {item.contact.organization && (
                      <span className="text-gray-500 dark:text-gray-400 font-normal ml-1">
                        ({item.contact.organization})
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Role
                    </label>
                    <OptionSelect
                      name="role"
                      defaultValue={item.role}
                      options={roles}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <ActionFormError />
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
                </ActionForm>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`/contacts/${item.contact.id}`}
                        className="text-gray-900 dark:text-white font-medium hover:underline"
                      >
                        {item.contact.firstName} {item.contact.lastName}
                      </a>
                      {item.role && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {item.role}
                        </span>
                      )}
                      {item.contact.organization && (
                        <span className="text-sm text-gray-400 dark:text-gray-500">
                          ({item.contact.organization})
                        </span>
                      )}
                    </div>
                    {(item.contact.email || item.contact.phone) && (
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {item.contact.email && (
                          <a href={`mailto:${item.contact.email}`} className="text-xs text-gray-500 dark:text-gray-400 hover:underline break-all">
                            {item.contact.email}
                          </a>
                        )}
                        {item.contact.phone && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatPhone(item.contact.phone)}</span>
                        )}
                      </div>
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
                      <InlineConfirmButton
                        onConfirm={() => removeContact(item.id)}
                        label="Remove"
                        confirmLabel="Remove"
                        resource={resource}
                        requiredLevel="WRITE"
                      />
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
