"use client";

import { useEffect, useRef, useState } from "react";
import { useCanWrite } from "@/components/PermissionsProvider";
import { AutosaveStatus } from "@/components/AutosaveStatus";
import { useAutosave } from "@/lib/useAutosave";

// ESG Part II (Function Schedule) / Part IIIa (Function Set-up Order) fields
// that have no home on the function's orders. Autosaves.
type FunctionEsgCardProps = {
  fn: {
    functionNumber: string | null;
    functionNumberPinned: boolean;
    postToReaderBoard: boolean | null;
    readerBoardText: string | null;
    hold24Hour: boolean;
    defaultSetup: string | null;
    expectedAttendance: number | null;
    setForCount: number | null;
    actualAttendance: number | null;
    decorNotes: string | null;
    securityNotes: string | null;
    signageNotes: string | null;
    billingNotes: string | null;
    costCenter: string | null;
  };
  numbersLocked: boolean;
  setupTypes: string[];
  // Must not redirect: the card autosaves through it.
  action: (formData: FormData) => Promise<void>;
};

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

function numberNote(fn: FunctionEsgCardProps["fn"], locked: boolean): string {
  if (fn.functionNumberPinned) return "Manual";
  if (!fn.functionNumber) return "Unnumbered";
  return locked ? "Locked" : "Auto";
}

export function FunctionEsgCard({ fn: current, numbersLocked, setupTypes, action }: FunctionEsgCardProps) {
  const canWrite = useCanWrite("FUNCTIONS");
  // The form is uncontrolled and autosaves, so it keeps the values it mounted
  // with; the refreshed ones after each save would only reset it.
  const [fn] = useState(current);
  const formRef = useRef<HTMLFormElement>(null);
  const payload = useRef<FormData | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (formRef.current) payload.current = new FormData(formRef.current);
  });
  const status = useAutosave(version, async () => {
    if (payload.current) await action(payload.current);
  });

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Specifications</h2>
        <AutosaveStatus {...status} />
      </div>
      <form
        ref={formRef}
        onChange={canWrite ? () => setVersion((v) => v + 1) : undefined}
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset disabled={!canWrite} className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="functionNumber" className={labelClass}>
                Function #
              </label>
              <input
                id="functionNumber"
                name="functionNumber"
                defaultValue={fn.functionNumberPinned ? (fn.functionNumber ?? "") : ""}
                placeholder={fn.functionNumber ? `Auto: ${fn.functionNumber}` : "Auto"}
                className={inputClass}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{numberNote(current, numbersLocked)}</p>
            </div>
            <div>
              <label htmlFor="costCenter" className={labelClass}>
                Cost center
              </label>
              <input id="costCenter" name="costCenter" defaultValue={fn.costCenter ?? ""} className={inputClass} />
            </div>
            <div>
              <label htmlFor="expectedAttendance" className={labelClass}>
                Attendance
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                id="expectedAttendance"
                name="expectedAttendance"
                defaultValue={fn.expectedAttendance ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="setForCount" className={labelClass}>
                Set for
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                id="setForCount"
                name="setForCount"
                defaultValue={fn.setForCount ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="actualAttendance" className={labelClass}>
                Actual attendance
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                id="actualAttendance"
                name="actualAttendance"
                defaultValue={fn.actualAttendance ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="postToReaderBoard" className={labelClass}>
                Reader board
              </label>
              <select
                id="postToReaderBoard"
                name="postToReaderBoard"
                defaultValue={fn.postToReaderBoard === null ? "" : String(fn.postToReaderBoard)}
                className={inputClass}
              >
                <option value="">Not set</option>
                <option value="true">Post</option>
                <option value="false">Do not post</option>
              </select>
            </div>
            <div>
              <label htmlFor="readerBoardText" className={labelClass}>
                Post as
              </label>
              <input
                id="readerBoardText"
                name="readerBoardText"
                defaultValue={fn.readerBoardText ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="hold24Hour"
              value="true"
              defaultChecked={fn.hold24Hour}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            24-hour hold on the room
          </label>
          <div>
            <label htmlFor="defaultSetup" className={labelClass}>
              Default set-up
            </label>
            <select id="defaultSetup" name="defaultSetup" defaultValue={fn.defaultSetup ?? ""} className={inputClass}>
              <option value="">Not set</option>
              {fn.defaultSetup && !setupTypes.includes(fn.defaultSetup) && (
                <option value={fn.defaultSetup}>{fn.defaultSetup}</option>
              )}
              {setupTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["decorNotes", "Décor", fn.decorNotes],
              ["securityNotes", "Security", fn.securityNotes],
              ["signageNotes", "Signage", fn.signageNotes],
              ["billingNotes", "Billing instructions", fn.billingNotes],
            ] as const
          ).map(([name, label, value]) => (
            <div key={name}>
              <label htmlFor={name} className={labelClass}>
                {label}
              </label>
              <textarea id={name} name={name} rows={2} defaultValue={value ?? ""} className={inputClass} />
            </div>
          ))}
        </fieldset>
      </form>
    </div>
  );
}
