"use client";

import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type {
  Presentation,
  PresentationTrack,
  PresentationContact,
  Contact,
  CustomOption,
} from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";

type SpeakerWithContact = PresentationContact & { contact: Contact };

type PresentationWithRelations = Presentation & {
  track: PresentationTrack | null;
  speakers: SpeakerWithContact[];
};

type SelectedSpeaker = {
  contact: Contact;
  role: string;
  isPrimary: boolean;
};

type PresentationFormProps = {
  presentation?: PresentationWithRelations;
  eventId: string;
  tracks: PresentationTrack[];
  presenterRoles: CustomOption[];
  presentationTypes: CustomOption[];
  action: (formData: FormData) => Promise<void>;
  searchContacts: (query: string) => Promise<Contact[]>;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Presentation" : "Create Presentation"}
    </button>
  );
}

type PresentationFieldsProps = {
  presentation?: PresentationWithRelations;
  tracks: PresentationTrack[];
  presentationTypes: CustomOption[];
};

function PresentationFields({ presentation, tracks, presentationTypes }: PresentationFieldsProps) {
  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="title" className={labelClass}>Title *</label>
        <input
          type="text"
          id="title"
          name="title"
          required
          defaultValue={presentation?.title}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={presentation?.description || ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="trackId" className={labelClass}>Track</label>
        {tracks.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No tracks defined for this event yet.
          </p>
        ) : (
          <select
            id="trackId"
            name="trackId"
            defaultValue={presentation?.trackId || ""}
            className={inputClass}
          >
            <option value="">No track</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {presentationTypes.length > 0 && (
        <div>
          <label htmlFor="type" className={labelClass}>Type</label>
          <select
            id="type"
            name="type"
            defaultValue={presentation?.type || ""}
            className={inputClass}
          >
            <option value="">No type</option>
            {presentationTypes.map((t) => (
              <option key={t.id} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="instanceCount" className={labelClass}>Instances</label>
        <input
          type="number"
          id="instanceCount"
          name="instanceCount"
          min={1}
          defaultValue={presentation?.instanceCount ?? 1}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={presentation?.notes || ""}
          placeholder={presentation ? undefined : "Internal notes about this presentation..."}
          className={inputClass}
        />
      </div>
    </div>
  );
}

export function PresentationForm({
  presentation,
  eventId,
  tracks,
  presenterRoles,
  presentationTypes,
  action,
  searchContacts,
}: PresentationFormProps) {
  const isEdit = !!presentation;
  const [editing, setEditing] = useState(false);

  const [speakers, setSpeakers] = useState<SelectedSpeaker[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
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
        const existingIds = new Set(speakers.map((s) => s.contact.id));
        setSearchResults(results.filter((c) => !existingIds.has(c.id)));
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchContacts, speakers]);

  const handleAddSpeaker = (contact: Contact) => {
    setSpeakers((prev) => [
      ...prev,
      { contact, role: "", isPrimary: prev.length === 0 },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemoveSpeaker = (contactId: string) => {
    setSpeakers((prev) => {
      const filtered = prev.filter((s) => s.contact.id !== contactId);
      // Promote first remaining speaker to primary if the primary was removed
      if (filtered.length > 0 && !filtered.some((s) => s.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  const handleSetPrimary = (contactId: string) => {
    setSpeakers((prev) =>
      prev.map((s) => ({
        ...s,
        isPrimary: s.contact.id === contactId,
      }))
    );
  };

  const handleRoleChange = (contactId: string, role: string) => {
    setSpeakers((prev) =>
      prev.map((s) => (s.contact.id === contactId ? { ...s, role } : s))
    );
  };

  const handleSubmit = async (formData: FormData) => {
    speakers.forEach((s) => {
      formData.append("speakerContactIds", s.contact.id);
      formData.append("speakerRoles", s.role);
    });
    const primary = speakers.find((s) => s.isPrimary);
    if (primary) {
      formData.set("primarySpeakerId", primary.contact.id);
    }
    await action(formData);
  };

  if (isEdit && !editing) {
    const typeLabel = presentation.type
      ? (presentationTypes.find((t) => t.value === presentation.type)?.label ?? presentation.type)
      : null;

    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Presentation Details</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Title" value={presentation.title} />
          <ReadOnlyField label="Description" value={presentation.description} />
          <ReadOnlyField label="Track" value={presentation.track?.name ?? null} />
          <ReadOnlyField label="Type" value={typeLabel} />
          <ReadOnlyField label="Instances" value={String(presentation.instanceCount)} />
          <ReadOnlyField label="Notes" value={presentation.notes} />
        </dl>
      </div>
    );
  }

  if (isEdit) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Presentation Details
        </h2>
        <form
          action={async (formData) => {
            await action(formData);
            setEditing(false);
          }}
          className="space-y-4"
        >
          <PresentationFields
            presentation={presentation}
            tracks={tracks}
            presentationTypes={presentationTypes}
          />
          <div className="flex gap-4">
            <SubmitButton isEdit={true} />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Presentation Details
        </h2>
        <PresentationFields tracks={tracks} presentationTypes={presentationTypes} />
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Speakers
        </h2>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Add Speaker
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by name, email, or organization..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
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
                  onClick={() => handleAddSpeaker(contact)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                >
                  <span className="text-gray-900 dark:text-white font-medium">
                    {contact.firstName} {contact.lastName}
                  </span>
                  {contact.organization && (
                    <span className="text-gray-500 dark:text-gray-400"> - {contact.organization}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No contacts found.{" "}
              <a href="/contacts/new" target="_blank" className="text-blue-600 hover:underline">
                Create a new contact
              </a>
            </p>
          )}
        </div>

        {speakers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No speakers added yet. Search above to add speakers.
          </p>
        ) : (
          <div className="space-y-2">
            {speakers.map((speaker) => (
              <div
                key={speaker.contact.id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex-1">
                  <span className="text-gray-900 dark:text-white font-medium">
                    {speaker.contact.firstName} {speaker.contact.lastName}
                  </span>
                  {speaker.contact.organization && (
                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                      ({speaker.contact.organization})
                    </span>
                  )}
                </div>

                <select
                  value={speaker.role}
                  onChange={(e) => handleRoleChange(speaker.contact.id, e.target.value)}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Role...</option>
                  {presenterRoles.map((r) => (
                    <option key={r.id} value={r.value}>{r.label}</option>
                  ))}
                </select>

                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="primarySpeakerUI"
                    checked={speaker.isPrimary}
                    onChange={() => handleSetPrimary(speaker.contact.id)}
                    className="text-blue-600"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Primary</span>
                </label>

                <button
                  type="button"
                  onClick={() => handleRemoveSpeaker(speaker.contact.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <SubmitButton isEdit={false} />
        <a
          href={`/events/${eventId}/presentations`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
