"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";
import { syncRangeEnd } from "@/lib/dateRange";
import { OptionChecklist } from "@/components/ui/OptionChecklist";

const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5";
const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

export type SpeakerProfileView = {
  contactId: string;
  name: string;
  updatedAt: string;
  contact: { bio: string | null; pronouns: string | null; jobTitle: string | null; website: string | null; headshotFileId: string | null };
  // Datetimes already as datetime-local strings in the event's time zone.
  profile: {
    arrivalAt: string;
    departureAt: string;
    travelNotes: string | null;
    hotelBlockId: string | null;
    hotel: string | null;
    dietary: string | null;
    dietaryNeeds: string[];
    avNeeds: string | null;
    shirtSize: string | null;
    notes: string | null;
    internalNotes: string | null;
  } | null;
};

type Props = {
  speakers: SpeakerProfileView[];
  // The dietary_need list.
  dietaryNeeds: string[];
  // The event's hotel blocks, labelled hotel · block type.
  hotelBlocks: { id: string; label: string }[];
  saveContact: (contactId: string, formData: FormData) => Promise<void | UserError>;
  saveProfile: (contactId: string, formData: FormData) => Promise<void | UserError>;
  removeHeadshot: (contactId: string) => Promise<void>;
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line break-words">{value}</dd>
    </div>
  );
}

const show = (local: string) => (local ? local.replace("T", " ") : null);

function SaveSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} text-sm disabled:opacity-50`}>
      {label}
    </button>
  );
}

function Speaker({ s, dietaryNeeds, hotelBlocks, saveContact, saveProfile, removeHeadshot }: { s: SpeakerProfileView } & Omit<Props, "speakers">) {
  const canWriteContact = useCanWrite("CONTACTS");
  const canWriteProfile = useCanWrite("PRESENTATIONS");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const p = s.profile;
  const block = p?.hotelBlockId ? hotelBlocks.find((b) => b.id === p.hotelBlockId)?.label : null;

  const saved = () => {
    setEditing(false);
    router.refresh();
  };

  return (
    <div className="py-4 first:pt-0 last:pb-0 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {s.contact.headshotFileId && (
            // eslint-disable-next-line @next/next/no-img-element -- served by the authenticated /api/files route
            <img src={`/api/files/${s.contact.headshotFileId}`} alt="" className="h-12 w-12 rounded-full object-cover bg-gray-100 dark:bg-gray-700" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {[s.contact.jobTitle, s.contact.pronouns].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {(canWriteContact || canWriteProfile) && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Field label="Bio" value={s.contact.bio} /></div>
          <Field label="Website" value={s.contact.website} />
          <Field label="Arrives" value={p ? show(p.arrivalAt) : null} />
          <Field label="Departs" value={p ? show(p.departureAt) : null} />
          <Field label="Hotel" value={[block, p?.hotel].filter(Boolean).join(" · ") || null} />
          <Field label="Travel" value={p?.travelNotes} />
          <Field label="Dietary" value={[p?.dietaryNeeds.join(", "), p?.dietary].filter(Boolean).join(" · ") || null} />
          <Field label="AV needs" value={p?.avNeeds} />
          <Field label="Shirt size" value={p?.shirtSize} />
          <Field label="Notes" value={p?.notes} />
          <Field label="Internal notes" value={p?.internalNotes} />
        </dl>
      ) : (
        <div className="space-y-4">
          {canWriteContact && (
            <ActionForm key={`c-${s.updatedAt}`} action={(fd) => saveContact(s.contactId, fd)} onDone={saved} className="space-y-3">
              <div>
                <label className={labelCls}>Bio</label>
                <textarea name="bio" rows={4} defaultValue={s.contact.bio ?? ""} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={labelCls}>Job title</label><input name="jobTitle" defaultValue={s.contact.jobTitle ?? ""} className={inputCls} /></div>
                <div><label className={labelCls}>Pronouns</label><input name="pronouns" defaultValue={s.contact.pronouns ?? ""} className={inputCls} /></div>
                <div><label className={labelCls}>Website</label><input name="website" defaultValue={s.contact.website ?? ""} className={inputCls} /></div>
              </div>
              <ActionFormError />
              <div className="flex flex-wrap items-center gap-3">
                <SaveSubmit label="Save profile" />
                {s.contact.headshotFileId && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(async () => { await removeHeadshot(s.contactId); router.refresh(); })}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                  >
                    Remove headshot
                  </button>
                )}
              </div>
            </ActionForm>
          )}
          {canWriteProfile && (
            <ActionForm key={`p-${s.updatedAt}`} action={(fd) => saveProfile(s.contactId, fd)} onDone={saved} className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Arrives</label><input type="datetime-local" name="arrivalAt" defaultValue={p?.arrivalAt ?? ""} onChange={(e) => syncRangeEnd(e.currentTarget, "departureAt", { fillEmpty: false })} className={inputCls} /></div>
                <div><label className={labelCls}>Departs</label><input type="datetime-local" name="departureAt" min={p?.arrivalAt || undefined} defaultValue={p?.departureAt ?? ""} className={inputCls} /></div>
                {hotelBlocks.length > 0 && (
                  <div>
                    <label className={labelCls}>Hotel block</label>
                    <select name="hotelBlockId" defaultValue={p?.hotelBlockId ?? ""} className={inputCls}>
                      <option value="">—</option>
                      {hotelBlocks.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls}>{hotelBlocks.length > 0 ? "Other hotel" : "Hotel"}</label>
                  <input name="hotel" defaultValue={p?.hotel ?? ""} className={inputCls} />
                </div>
                <div><label className={labelCls}>Shirt size</label><input name="shirtSize" defaultValue={p?.shirtSize ?? ""} className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Travel</label><textarea name="travelNotes" rows={2} defaultValue={p?.travelNotes ?? ""} className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dietary</label>
                  <OptionChecklist name="dietaryNeeds" options={dietaryNeeds} checked={p?.dietaryNeeds ?? []} />
                  <input name="dietary" aria-label="Other dietary needs" placeholder="Other" defaultValue={p?.dietary ?? ""} className={`${inputCls} mt-2`} />
                </div>
                <div className="sm:col-span-2"><label className={labelCls}>AV needs</label><input name="avNeeds" defaultValue={p?.avNeeds ?? ""} className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Notes</label><textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Internal notes</label><textarea name="internalNotes" rows={2} defaultValue={p?.internalNotes ?? ""} className={inputCls} /></div>
              </div>
              <ActionFormError />
              <SaveSubmit label="Save event details" />
            </ActionForm>
          )}
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export function SpeakerProfilesPanel({ speakers, ...actions }: Props) {
  if (speakers.length === 0) return null;
  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Speaker Profiles</h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {speakers.map((s) => <Speaker key={s.contactId} s={s} {...actions} />)}
      </div>
    </section>
  );
}
