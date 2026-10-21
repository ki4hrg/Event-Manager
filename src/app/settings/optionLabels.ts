// One spelling per option list: a label matching another option but for case,
// spacing or punctuation (labelKey) is a duplicate. Plain module: the settings
// actions refuse it, and OptionList checks first so the refusal reads in
// production builds (where a Server Action's thrown message is redacted).

import { labelKey } from "@/lib/hotels";

export function duplicateLabelError(label: string, options: { id: string; label: string }[], mergeable: boolean, exceptId?: string): string | null {
  const same = options.find((o) => o.id !== exceptId && labelKey(o.label) === labelKey(label));
  return same ? `"${same.label}" is already in this list${mergeable ? "; merge into it instead" : ""}` : null;
}
