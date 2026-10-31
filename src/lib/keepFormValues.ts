import type { FormEvent } from "react";

// React 19 resets a `<form action={fn}>` once the action returns, so a form
// that stays on screen after the action refused the input (a validation or
// server error) loses what the user typed. React resets through the native
// `form.reset()`, whose cancelable "reset" event this cancels, so the form
// keeps its values as it did on React 18 and `useFormStatus` still works.
// Usage: `<form action={fn} onReset={keepFormValues}>` on a form that closes
// or navigates away on success. It cancels every reset, so a form that has a
// reset button or calls `form.reset()` itself after a success cancels only
// after a refusal (`AddItemForm` in LocationContents.tsx).
export function keepFormValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
}
