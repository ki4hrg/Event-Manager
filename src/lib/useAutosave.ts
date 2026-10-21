import { useCallback, useEffect, useRef, useState } from "react";

const AUTOSAVE_MS = 800;

// Saves `value` 800ms after it last changed, through a Server Action that
// doesn't redirect. One save runs at a time; a change made during one saves
// after it. A failed save waits for the next change. Unsaved changes still go
// out when the component unmounts, and the browser warns before unloading
// with any pending. `invalid` holds saving and is shown as the reason.
// The value is compared by identity: pass state that changes only on edits.
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, { invalid = null }: { invalid?: string | null } = {}) {
  const [saved, setSaved] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const sent = useRef(value);
  const latest = useRef({ value, saved, save, invalid });
  useEffect(() => {
    latest.current = { value, saved, save, invalid };
  });

  const send = useCallback((v: T) => {
    sent.current = v;
    chain.current = chain.current.then(async () => {
      setSaving(true);
      try {
        await latest.current.save(v);
        setSaved(v);
        setSavedOnce(true);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      } finally {
        setSaving(false);
      }
    });
  }, []);

  useEffect(() => {
    if (invalid || value === saved || value === sent.current) return;
    const t = setTimeout(() => send(value), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [value, saved, invalid, send]);

  useEffect(() => {
    const at = latest;
    return () => {
      const l = at.current;
      if (!l.invalid && l.value !== l.saved && l.value !== sent.current) send(l.value);
    };
  }, [send]);

  const dirty = value !== saved;
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  return { saving: saving || (dirty && !invalid && !error), error: invalid ?? error, saved: savedOnce && !dirty && !saving };
}
