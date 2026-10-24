import { EXHIBIT_EQUIPMENT_SOURCES, EXHIBIT_PROVIDERS } from "@/lib/forms/meta";

const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const checkCls = "flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200";
const boxCls = "rounded border-gray-300 dark:border-gray-600";

// Exhibit Request link settings, posted as opt_* fields and read by the
// module's linkOptionsFromForm. One booth type checked fixes it; no provider
// checked leaves that question off the form.
export function ExhibitLinkFields({ boothTypes }: { boothTypes: { id: string; label: string }[] }) {
  return (
    <div className="space-y-4">
      {boothTypes.length > 0 && (
        <fieldset>
          <legend className={labelCls}>Booth types offered</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {boothTypes.map((t) => (
              <label key={t.id} className={checkCls}>
                <input type="checkbox" name="opt_boothTypes" value={t.id} defaultChecked className={boxCls} />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className={checkCls}>
        <input type="checkbox" name="opt_askLocation" value="true" className={boxCls} />
        Ask for a preferred location
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(
          [
            { name: "opt_electrical", label: "Electrical options" },
            { name: "opt_av", label: "Audio visual options" },
          ] as const
        ).map((service) => (
          <fieldset key={service.name}>
            <legend className={labelCls}>{service.label}</legend>
            {EXHIBIT_PROVIDERS.map((p) => (
              <label key={p.value} className={checkCls}>
                <input type="checkbox" name={service.name} value={p.value} defaultChecked className={boxCls} />
                {p.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <fieldset>
        <legend className={labelCls}>Equipment</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {EXHIBIT_EQUIPMENT_SOURCES.map((src) => (
            <label key={src.value} className={checkCls}>
              <input type="checkbox" name="opt_equipment" value={src.value} defaultChecked className={boxCls} />
              {src.staffLabel}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
