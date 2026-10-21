"use client";

import {
  SPEAKER_PROFILE_SECTIONS,
  type SpeakerProfileBaseline,
  type SpeakerProfilePayload,
  type SpeakerProfileSection,
} from "@/lib/forms/meta";
import { Card, FormFrame, OnFile, inputCls, labelCls, type CommonFormProps, type DraftView } from "./FormParts";

type Props = CommonFormProps & {
  baseline: SpeakerProfileBaseline;
  sections: SpeakerProfileSection[];
  draft: DraftView<SpeakerProfilePayload> | null;
};

const sectionLabel = (key: SpeakerProfileSection) => SPEAKER_PROFILE_SECTIONS.find((s) => s.key === key)!.label;

export function SpeakerProfileForm({ baseline, sections, draft, ...common }: Props) {
  const p = draft?.payload ?? null;
  const on = new Set(sections);
  // Bio fields prefill from what's on file; travel and needs never do.
  const bio = (key: "bio" | "jobTitle" | "pronouns" | "website") =>
    p?.[key] !== undefined ? p[key] ?? "" : baseline[key] ?? "";
  const val = (key: keyof SpeakerProfilePayload) => p?.[key] ?? "";

  return (
    <FormFrame {...common} recipientName={common.recipientName ?? baseline.speakerName} draft={draft}>
      <Card title="Session">
        <OnFile label="Presentation">{baseline.presentationTitle}</OnFile>
      </Card>

      {on.has("bio") && (
        <Card title={sectionLabel("bio")}>
          <div>
            <label htmlFor="bio" className={labelCls}>Bio</label>
            <textarea id="bio" name="bio" rows={6} maxLength={4000} defaultValue={bio("bio")} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="jobTitle" className={labelCls}>Job title</label>
              <input id="jobTitle" name="jobTitle" maxLength={200} defaultValue={bio("jobTitle")} className={inputCls} />
            </div>
            <div>
              <label htmlFor="pronouns" className={labelCls}>Pronouns</label>
              <input id="pronouns" name="pronouns" maxLength={40} defaultValue={bio("pronouns")} className={inputCls} />
            </div>
            <div>
              <label htmlFor="website" className={labelCls}>Website</label>
              <input id="website" name="website" maxLength={300} defaultValue={bio("website")} className={inputCls} />
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {baseline.hasHeadshot ? "Headshot on file. Attach a JPEG, PNG or WebP below to replace it." : "Attach a headshot (JPEG, PNG or WebP) below."}
          </p>
        </Card>
      )}

      {on.has("travel") && (
        <Card title={sectionLabel("travel")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="arrivalAt" className={labelCls}>Arriving</label>
              <input id="arrivalAt" name="arrivalAt" type="datetime-local" defaultValue={val("arrivalAt")} className={inputCls} />
            </div>
            <div>
              <label htmlFor="departureAt" className={labelCls}>Departing</label>
              <input id="departureAt" name="departureAt" type="datetime-local" defaultValue={val("departureAt")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="hotel" className={labelCls}>Hotel</label>
              <input id="hotel" name="hotel" maxLength={200} defaultValue={val("hotel")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="travelNotes" className={labelCls}>Flights and other travel details</label>
              <textarea id="travelNotes" name="travelNotes" rows={3} maxLength={2000} defaultValue={val("travelNotes")} className={inputCls} />
            </div>
          </div>
        </Card>
      )}

      {on.has("needs") && (
        <Card title={sectionLabel("needs")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="dietary" className={labelCls}>Dietary needs</label>
              <input id="dietary" name="dietary" maxLength={2000} defaultValue={val("dietary")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="avNeeds" className={labelCls}>Audio visual preferences</label>
              <input id="avNeeds" name="avNeeds" maxLength={2000} defaultValue={val("avNeeds")} className={inputCls} />
            </div>
            <div>
              <label htmlFor="shirtSize" className={labelCls}>Shirt size</label>
              <input id="shirtSize" name="shirtSize" maxLength={20} defaultValue={val("shirtSize")} className={inputCls} />
            </div>
          </div>
        </Card>
      )}
    </FormFrame>
  );
}
