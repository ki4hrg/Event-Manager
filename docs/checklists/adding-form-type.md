# Adding a public form type

Read [../forms.md](../forms.md) first. Function Review (`src/lib/forms/functionReview.ts`) is the reference.

1. **Schema.** Add the value to `FormType`. If the form targets a record, add a nullable FK on `FormLink` (cascade) plus the back-relation. Ship it as a migration.
2. **Meta** (`src/lib/forms/meta.ts`): add the label to `FORM_TYPE_LABEL`, plus the section list, payload type and baseline type.
3. **Module** (`src/lib/forms/<type>.ts`):
   - [ ] `baseline`: an explicit Prisma `select`. Check every field against "would I hand this to a stranger?"
   - [ ] `parse`: validate every posted id against the link's event or tenant. Cap string lengths and repeat counts. Throw `PublicFormError("invalid")`.
   - [ ] `diff`: return `FormDiffSection[]`, with values as plain strings.
   - [ ] `apply`: run as the reviewer through existing cores. Write only the fields the submitter changed, under a compare-and-set on the target's `updatedAt`. Use plain-text and integer columns only, never a column rendered with `dangerouslySetInnerHTML`. Contacts follow the reviewer's choice and are never updated from public input.
4. **Dispatch.** Add a case to each switch in `src/lib/forms/index.ts`, `createFormLinkCore` / `applyFormSubmissionCore` (`src/app/events/forms/core.ts`), `getFormSubmissionReview` (`actions.ts`), and the public page (`src/app/f/[token]/page.tsx`). The exhaustive `never` closers flag any you miss.
5. **Public form component** under `src/app/f/[token]/`:
   - Keep inputs uncontrolled and include the hidden `version` field and the honeypot.
   - It must work at 360 px.
6. **Entry point:** a `FormLinkButton` on the target's page, gated on `FORMS` WRITE.
7. **Verify:**
   - Grep the public HTML (it includes the RSC payload) for seeded internal values.
   - Run a stale-version submit, a foreign id, and an XSS string in every field.
   - Confirm Apply stays blocked until the approval workflow is complete.
