export function isRichTextEmpty(form: HTMLFormElement, fieldName: string): boolean {
  const input = form.querySelector(`input[name="${fieldName}"]`) as HTMLInputElement | null;
  return (input?.value.replace(/<[^>]*>/g, "").trim() ?? "") === "";
}
