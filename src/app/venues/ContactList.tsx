"use client";

import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type { VenueContact, Contact } from "@prisma/client";

type VenueContactWithContact = VenueContact & { contact: Contact };

type ContactListProps = {
  contacts: VenueContactWithContact[];
  venueId: string;
  addContact: (formData: FormData) => Promise<void>;
  updateContact: (contactId: string, formData: FormData) => Promise<void>;
  removeContact: (contactId: string) => Promise<void>;
  searchContacts: (query: string) => Promise<Contact[]>;
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
  venueId,
  addContact,
  updateContact,
  removeContact,
  searchContacts,
}: ContactListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
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

  const handleAddFormSubmit = async (formData: FormData) => {
    if (!selectedContact) return;
    formData.set("contactId", selectedContact.id);
    await addContact(formData);
    setSelectedContact(null);
    setShowAddForm(false);
  };

  const handleUpdateSubmit = async (contactId: string, formData: FormData) => {
    await updateContact(contactId, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Contacts</h2>
        <button
          onClick={() => {
            setShowAddForm(true);
            setSelectedContact(null);
            setSearchQuery("");
          }}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Contact
        </button>
      </div>

      {showAddForm && (
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
                    <a href="/contacts/new" className="text-blue-600 hover:underline">
                      Create a new contact
                    </a>
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
              <input
                type="text"
                name="role"
                placeholder="e.g. Sales Manager, Event Coordinator..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <SubmitButton label="Add Contact" />
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setSelectedContact(null);
                setSearchQuery("");
              }}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
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
                <form
                  action={(formData) => handleUpdateSubmit(item.id, formData)}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      name="role"
                      defaultValue={item.role || ""}
                      placeholder="e.g. Sales Manager, Event Coordinator..."
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
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
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 dark:text-white font-medium">
                      {item.contact.firstName} {item.contact.lastName}
                    </span>
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
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => setEditingId(item.id)}
                      className="text-blue-600 hover:underline text-sm"
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
