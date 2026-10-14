import { RichTextEditor } from "@/components/RichTextEditor";
import { ORG_PROFILE_FIELDS, type OrgProfile } from "@/lib/orgProfile";

// Organization profile inputs and read-only view, shared by the super-admin
// tenant form and the tenant's own Settings → Organization page.

const inputClass =
  "mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500";

export function OrgProfileFields({ profile }: { profile?: OrgProfile }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ORG_PROFILE_FIELDS.map((f) => (
        <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
          <label htmlFor={`org-${f.key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {f.label}
          </label>
          {f.kind === "richtext" ? (
            <div className="mt-1">
              <RichTextEditor name={f.key} defaultValue={profile?.[f.key] ?? ""} />
            </div>
          ) : (
            <input
              type={f.kind}
              id={`org-${f.key}`}
              name={f.key}
              defaultValue={profile?.[f.key] ?? ""}
              placeholder={f.kind === "url" ? "https://" : undefined}
              className={inputClass}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function OrgProfileView({ profile }: { profile: OrgProfile }) {
  const filled = ORG_PROFILE_FIELDS.filter((f) => profile[f.key]);
  if (filled.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">No contact details yet.</p>;
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {filled.map((f) => (
        <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{f.label}</dt>
          {f.kind === "richtext" ? (
            // HTML from RichTextEditor (OrgProfileFields).
            <dd
              className="mt-1 text-sm text-gray-900 dark:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1"
              dangerouslySetInnerHTML={{ __html: profile[f.key] as string }}
            />
          ) : (
            <dd className="mt-1 text-sm text-gray-900 dark:text-white break-words">{profile[f.key]}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
