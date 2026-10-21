"use client";

import { useState } from "react";
import {
  functionReviewSectionLabel,
  type FunctionReviewBaseline,
  type FunctionReviewPayload,
  type FunctionReviewSection,
} from "@/lib/forms/meta";
import { Card, Empty, FormFrame, OnFile, inputCls, labelCls, type CommonFormProps, type DraftView } from "./FormParts";

type Props = CommonFormProps & {
  baseline: FunctionReviewBaseline;
  sections: FunctionReviewSection[];
  setupTypes: string[];
  draft: DraftView<FunctionReviewPayload> | null;
};

function Verdict({ section, payload }: { section: FunctionReviewSection; payload: FunctionReviewPayload | null }) {
  const response = payload?.responses?.[section];
  const [verdict, setVerdict] = useState<string>(response?.verdict ?? "");
  return (
    <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
      <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={`${functionReviewSectionLabel(section)} review`}>
        {[
          { value: "ok", label: "Looks right" },
          { value: "changes", label: "Needs changes" },
        ].map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
            <input
              type="radio"
              name={`r_${section}_verdict`}
              value={o.value}
              checked={verdict === o.value}
              onChange={() => setVerdict(o.value)}
              className="border-gray-300 dark:border-gray-600"
            />
            {o.label}
          </label>
        ))}
      </div>
      {verdict === "changes" ? (
        <div>
          <label htmlFor={`r_${section}_note`} className={labelCls}>What needs to change?</label>
          <textarea
            id={`r_${section}_note`}
            name={`r_${section}_note`}
            rows={3}
            maxLength={2000}
            defaultValue={response?.note ?? ""}
            className={inputCls}
          />
        </div>
      ) : (
        <input type="hidden" name={`r_${section}_note`} value={response?.note ?? ""} />
      )}
    </div>
  );
}

export function FunctionReviewForm({ baseline, sections, setupTypes, draft, ...common }: Props) {
  const p = draft?.payload ?? null;
  // A field the draft holds wins; otherwise what's on file.
  const val = <K extends keyof FunctionReviewPayload>(key: K, fallback: string | number | null) => {
    const v = p?.[key];
    return v === undefined ? (fallback ?? "") : ((v as string | number | null) ?? "");
  };
  const on = new Set(sections);

  return (
    <FormFrame {...common} draft={draft}>
      {on.has("overview") && (
        <Card title={functionReviewSectionLabel("overview")}>
          <OnFile label="Rooms">{baseline.rooms.length ? baseline.rooms.join(", ") : <Empty>No room assigned yet.</Empty>}</OnFile>
          <div>
            <label htmlFor="description" className={labelCls}>Description</label>
            <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={val("description", baseline.description)} className={inputCls} />
          </div>
          <div className="sm:w-48">
            <label htmlFor="expectedAttendance" className={labelCls}>Expected attendance</label>
            <input id="expectedAttendance" name="expectedAttendance" type="number" min={0} max={100000} inputMode="numeric" defaultValue={val("expectedAttendance", baseline.expectedAttendance)} className={inputCls} />
          </div>
          <Verdict section="overview" payload={p} />
        </Card>
      )}

      {on.has("schedule") && (
        <Card title={functionReviewSectionLabel("schedule")}>
          {baseline.schedules.length ? (
            <ul className="space-y-1">
              {baseline.schedules.map((s, i) => (
                <li key={i} className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">{s.type}</span> <span className="text-gray-600 dark:text-gray-400">· {s.time}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No times scheduled yet.</Empty>
          )}
          <Verdict section="schedule" payload={p} />
        </Card>
      )}

      {on.has("setup") && (
        <Card title={functionReviewSectionLabel("setup")}>
          <div className="sm:w-72">
            <label htmlFor="defaultSetup" className={labelCls}>Setup style</label>
            <select id="defaultSetup" name="defaultSetup" defaultValue={val("defaultSetup", baseline.defaultSetup)} className={inputCls}>
              <option value="">Not set</option>
              {setupTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {baseline.setup.map((s, i) => (
            <OnFile key={i} label={s.order}>
              {s.setupType && <p>{s.setupType}</p>}
              {s.tables.map((t, j) => <p key={j} className="text-gray-600 dark:text-gray-400">{t}</p>)}
            </OnFile>
          ))}
          <Verdict section="setup" payload={p} />
        </Card>
      )}

      {on.has("catering") && baseline.catering && (
        <Card title={functionReviewSectionLabel("catering")}>
          {(baseline.catering.mealType || baseline.catering.serviceStyle) && (
            <OnFile label="Service">{[baseline.catering.mealType, baseline.catering.serviceStyle].filter(Boolean).join(" · ")}</OnFile>
          )}
          <div className="sm:w-48">
            <label htmlFor="cateringExpectedCount" className={labelCls}>Expected count</label>
            <input id="cateringExpectedCount" name="cateringExpectedCount" type="number" min={0} max={100000} inputMode="numeric" defaultValue={val("cateringExpectedCount", baseline.catering.expectedCount)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="dietaryNotes" className={labelCls}>Dietary needs</label>
            <textarea id="dietaryNotes" name="dietaryNotes" rows={3} maxLength={2000} defaultValue={val("dietaryNotes", baseline.catering.dietaryNotes)} className={inputCls} />
          </div>
          <Verdict section="catering" payload={p} />
        </Card>
      )}

      {on.has("av") && (
        <Card title={functionReviewSectionLabel("av")}>
          {baseline.av.length ? (
            baseline.av.map((o, i) => (
              <OnFile key={i} label={o.order}>
                {o.items.length ? (
                  <ul>{o.items.map((it, j) => <li key={j}>{it.quantity != null ? `${it.quantity} × ` : ""}{it.item}</li>)}</ul>
                ) : (
                  <Empty>No equipment listed.</Empty>
                )}
              </OnFile>
            ))
          ) : (
            <Empty>No audio visual planned yet.</Empty>
          )}
          <Verdict section="av" payload={p} />
        </Card>
      )}

      {on.has("materials") && (
        <Card title={functionReviewSectionLabel("materials")}>
          {baseline.materials.length ? (
            baseline.materials.map((o, i) => (
              <OnFile key={i} label={o.order}>
                {o.items.length ? (
                  <ul>{o.items.map((it, j) => <li key={j}>{it.quantity != null ? `${it.quantity} × ` : ""}{it.description}</li>)}</ul>
                ) : (
                  <Empty>No items listed.</Empty>
                )}
              </OnFile>
            ))
          ) : (
            <Empty>No printed materials or supplies planned yet.</Empty>
          )}
          <Verdict section="materials" payload={p} />
        </Card>
      )}

      {on.has("signage") && (
        <Card title={functionReviewSectionLabel("signage")}>
          <div>
            <label htmlFor="signageNotes" className={labelCls}>Signage</label>
            <textarea id="signageNotes" name="signageNotes" rows={3} maxLength={2000} defaultValue={val("signageNotes", baseline.signageNotes)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="decorNotes" className={labelCls}>Decor</label>
            <textarea id="decorNotes" name="decorNotes" rows={3} maxLength={2000} defaultValue={val("decorNotes", baseline.decorNotes)} className={inputCls} />
          </div>
          <Verdict section="signage" payload={p} />
        </Card>
      )}

      {on.has("contact") && (
        <Card title={functionReviewSectionLabel("contact")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="contactFirstName" className={labelCls}>First name</label>
              <input id="contactFirstName" name="contactFirstName" maxLength={120} defaultValue={p?.contact?.firstName ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactLastName" className={labelCls}>Last name</label>
              <input id="contactLastName" name="contactLastName" maxLength={120} defaultValue={p?.contact?.lastName ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactEmail" className={labelCls}>Email</label>
              <input id="contactEmail" name="contactEmail" type="email" maxLength={200} defaultValue={p?.contact?.email ?? ""} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactPhone" className={labelCls}>Mobile phone</label>
              <input id="contactPhone" name="contactPhone" type="tel" maxLength={40} defaultValue={p?.contact?.phone ?? ""} className={inputCls} />
            </div>
          </div>
          <Verdict section="contact" payload={p} />
        </Card>
      )}

    </FormFrame>
  );
}
