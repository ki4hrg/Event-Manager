# Adding a public form type

Read [../forms.md](../forms.md) first. Function Review (`src/lib/forms/functionReview.ts`) is the reference for a form that reviews an existing record; Item Request (`itemRequest.ts`) for an open form that creates records.

1. **Schema.** Add the value to `FormType`. If the form targets a record, add a nullable FK on `FormLink` (cascade) plus the back-relation, and thread it through `FormLinkTarget` / `LinkTargetArgs` (`src/lib/forms/types.ts`), `CreateFormLinkArgs` and `linkTargetSelect` (`src/app/events/forms/core.ts`), and the selects in `actions.ts`. Ship it as a migration.
2. **Meta** (`src/lib/forms/meta.ts`): add the label to `FORM_TYPE_LABEL`, plus the section list, payload type and baseline type. Client-safe only.
3. **Module** (`src/lib/forms/<type>.ts`) implementing `FormModule` (`types.ts`):
   - [ ] `open`: true when anyone with the link may submit (no target record).
   - [ ] `assertTarget`: check the creating user may see the target and that it's in the event (or tenant).
   - [ ] `snapshot`: the baseline as an explicit Prisma `select`. Check every field against "would I hand this to a stranger?" — and against a forwarded link (speaker travel is never prefilled). `version` must change whenever a column apply can write changes; create-only forms use a constant.
   - [ ] `parse`: validate every posted id against the snapshot or the link's event/tenant. Cap string lengths and repeat counts. Throw `PublicFormError("invalid")`. URLs: `http(s)` only, stored as text.
   - [ ] `rebase`: fields the submitter left as shown follow the record (identity for create-only forms).
   - [ ] `diff`: `FormDiffSection[]` with values as plain strings; `mode: "create"` for proposals with no record on file.
   - [ ] `reviewChoices`: reviewer decisions (contact via `contactReviewChoice`, target order, headshot), keyed by section.
   - [ ] `apply`: run as the reviewer through existing cores. Write only the fields the submitter changed; a core that replaces a whole row gets the current row with only those fields swapped. Use plain-text and integer columns only, never a column rendered with `dangerouslySetInnerHTML`. Contacts follow `resolveContactChoice` and are never updated from public input (Speaker Profile is the documented exception). Return `filesTo` for where attachments belong.
4. **Register** it in `formModule()` (`src/lib/forms/index.ts`) and add the client component case in `src/app/f/[token]/page.tsx`. The exhaustive `never` closers flag any you miss.
5. **Public form component** under `src/app/f/[token]/`:
   - Wrap it in `FormFrame` (`FormParts.tsx`): version, honeypot, banners, submitter details, attachments, buttons.
   - Keep inputs uncontrolled. Never name a field `HONEYPOT_FIELD`.
   - It must work at 360 px.
6. **Entry point:** a `FormLinkEntry` on the target's page (or the forms page and the matching list, for open forms).
7. **MCP:** document the new type's target ids in `create_form_link`'s description (`src/lib/mcpTools/forms.ts`).
8. **Verify:**
   - Grep the public HTML (it includes the RSC payload) for seeded internal values.
   - Run a stale-version submit, a foreign id, and an XSS string in every field.
   - Confirm Apply stays blocked until the approval workflow is complete, and that untouched fields survive apply.
