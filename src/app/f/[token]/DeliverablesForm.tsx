"use client";

import {
  DELIVERABLES_SECTIONS,
  type DeliverablesBaseline,
  type DeliverablesPayload,
  type DeliverablesSection,
} from "@/lib/forms/meta";
import { Card, FormFrame, inputCls, labelCls, type CommonFormProps, type DraftView } from "./FormParts";

type Props = CommonFormProps & {
  baseline: DeliverablesBaseline;
  sections: DeliverablesSection[];
  draft: DraftView<DeliverablesPayload> | null;
};

const sectionLabel = (key: DeliverablesSection) => DELIVERABLES_SECTIONS.find((s) => s.key === key)!.label;

export function DeliverablesForm({ baseline, sections, draft, ...common }: Props) {
  const p = draft?.payload ?? null;
  const on = new Set(sections);
  return (
    <FormFrame {...common} recipientName={common.recipientName ?? baseline.speakerName} draft={draft}>
      {on.has("details") && (
        <Card title={sectionLabel("details")}>
          <div>
            <label htmlFor="title" className={labelCls}>Title</label>
            <input id="title" name="title" required maxLength={300} defaultValue={p?.title ?? baseline.title} className={inputCls} />
          </div>
          <div>
            <label htmlFor="description" className={labelCls}>Description</label>
            <textarea
              id="description"
              name="description"
              rows={5}
              maxLength={2000}
              defaultValue={p?.description !== undefined ? p.description ?? "" : baseline.description ?? ""}
              className={inputCls}
            />
          </div>
        </Card>
      )}

      {on.has("av") && (
        <Card title={sectionLabel("av")}>
          <label htmlFor="avNeeds" className={labelCls}>Microphones, video playback, laptop, internet, clicker…</label>
          <textarea id="avNeeds" name="avNeeds" rows={3} maxLength={2000} defaultValue={p?.avNeeds ?? ""} className={inputCls} />
        </Card>
      )}

      {on.has("media") && (
        <Card title={sectionLabel("media")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {baseline.mediaTypes.length > 0 && (
              <div>
                <label htmlFor="mediaType" className={labelCls}>What are you sending?</label>
                <select id="mediaType" name="mediaType" defaultValue={p?.media?.mediaType ?? ""} className={inputCls}>
                  <option value="">Choose…</option>
                  {baseline.mediaTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="mediaLink" className={labelCls}>Link to your file (Dropbox, Google Drive, WeTransfer…)</label>
              <input id="mediaLink" name="mediaLink" type="url" maxLength={500} placeholder="https://" defaultValue={p?.media?.link ?? ""} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mediaNotes" className={labelCls}>Notes</label>
              <textarea id="mediaNotes" name="mediaNotes" rows={2} maxLength={2000} defaultValue={p?.media?.notes ?? ""} className={inputCls} />
            </div>
          </div>
        </Card>
      )}

      {on.has("handouts") && (
        <Card title={sectionLabel("handouts")}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-3">
              <label htmlFor="handoutDescription" className={labelCls}>What should be printed?</label>
              <input id="handoutDescription" name="handoutDescription" maxLength={300} defaultValue={p?.handouts?.description ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="handoutQuantity" className={labelCls}>Copies</label>
              <input id="handoutQuantity" name="handoutQuantity" type="number" min={0} max={99999} inputMode="numeric" defaultValue={p?.handouts?.quantity ?? ""} className={inputCls} />
            </div>
          </div>
        </Card>
      )}
    </FormFrame>
  );
}
