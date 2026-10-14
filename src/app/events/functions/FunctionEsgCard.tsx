"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

// ESG Part II (Function Schedule) / Part IIIa (Function Set-up Order) fields
// that have no home on the function's orders.
type FunctionEsgCardProps = {
  fn: {
    functionNumber: string | null;
    functionNumberPinned: boolean;
    postToReaderBoard: boolean | null;
    readerBoardText: string | null;
    hold24Hour: boolean;
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
  action: (formData: FormData) => Promise<void>;
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} text-sm disabled:opacity-50`}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function readerBoard(fn: FunctionEsgCardProps["fn"]): string | null {
  if (fn.postToReaderBoard === null) return null;
  if (!fn.postToReaderBoard) return "Do not post";
  return fn.readerBoardText ? `Post as "${fn.readerBoardText}"` : "Post";
}

function numberNote(fn: FunctionEsgCardProps["fn"], locked: boolean): string {
  if (fn.functionNumberPinned) return "Manual override";
  if (!fn.functionNumber) return "Assigned once the function is scheduled";
  return locked ? "Locked" : "Auto (chronological)";
}

export function FunctionEsgCard({ fn, numbersLocked, action }: FunctionEsgCardProps) {
  const canWrite = useCanWrite("FUNCTIONS");
  const [editing, setEditing] = useState(false);
  const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6";

  if (!editing || !canWrite) {
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Specifications</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <ReadOnlyField label="Function #" value={fn.functionNumber} />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{numberNote(fn, numbersLocked)}</p>
          </div>
          <ReadOnlyField label="Reader board" value={readerBoard(fn)} />
          <ReadOnlyField label="Attendance" value={fn.expectedAttendance != null ? String(fn.expectedAttendance) : null} />
          <ReadOnlyField label="Set for" value={fn.setForCount != null ? String(fn.setForCount) : null} />
          <ReadOnlyField label="Actual attendance" value={fn.actualAttendance != null ? String(fn.actualAttendance) : null} />
          <ReadOnlyField label="24-hour hold" value={fn.hold24Hour ? "Yes" : "No"} />
          <ReadOnlyField label="Cost center" value={fn.costCenter} />
        </dl>
        <dl className="grid grid-cols-1 gap-4 mt-4">
          <ReadOnlyField label="Décor" value={fn.decorNotes} />
          <ReadOnlyField label="Security" value={fn.securityNotes} />
          <ReadOnlyField label="Signage" value={fn.signageNotes} />
          <ReadOnlyField label="Billing instructions" value={fn.billingNotes} />
        </dl>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Specifications</h2>
      <form
        action={async (formData) => {
          await action(formData);
          setEditing(false);
        }}
        className="space-y-4"
      >
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
        <div className="flex gap-3">
          <SaveButton />
          <button type="button" onClick={() => setEditing(false)} className={`${btnSecondary} text-sm`}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
