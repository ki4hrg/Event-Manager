# Public forms

Tokenized links (`/f/<token>`) that people without an account fill in: a function sponsor confirming setup details today, presenters, exhibitors and requesters later. Nothing a submitter sends writes to live records. It lands in a review queue (`/events/[id]/forms`). There, staff see a diff against the record, optionally wait for an approval workflow to finish, and apply it section by section.

## Model

- `FormLink` holds the token (256-bit, `generateShareToken`), tenant, event, `formType`, and an optional target (`functionId`). It also holds the recipient, `config` (`{ sections, intro }`), `workflowTemplateId` (the approval workflow), `dueAt`, a required `expiresAt`, `maxSubmissions` and `submittedCount`.
- A **bundle** is one link over several child links (`FormLink.bundle`, children by `parentId`): a Function Review of several functions, or a speaker's profile and deliverables together (`alsoFormTypes`). The parent holds the recipient, the message and the email, has no target and takes no submissions (`getActiveFormLink` never returns it). `/f/<parent>` lists its open children (`getActiveFormBundle`); each child is an ordinary link reviewed on its own, and links back to the bundle. Revoking or deleting the parent covers every child.
- A link either names a recipient (a contact on the target, or a name and email typed in) or goes to **anyone with the link** (`audience=anyone`: no recipient, no email, no receipt).
- Only a revoked link can be **deleted**, and only when nothing it received is waiting for review. Its drafts and handled submissions go with it (files on disk too); applied files were copied to their records and stay.
- `config.options` holds a form type's own link settings (`FormModule.linkOptionsFromForm` / `linkOptions`). Exhibit Request uses it for the booth types offered (`boothTypeIds`, booth_type option ids so renames carry through; one fixes it), whether to ask for a location, the electrical and AV choices (none hides the question, one fixes it), and whether to ask for equipment to provide, equipment they're bringing, or both. Links without settings ask everything.
- `FormSubmission` moves through the states DRAFT → SUBMITTED → APPLIED / REJECTED (or DRAFT → WITHDRAWN). It holds:
  - `payload`: the typed answers.
  - `baseline`: the public projection the submitter saw. A draft kept from a stale post holds the one the form posted back, which only steers that draft's rebase; submit always stores the server's.
  - `status` / `substatus`: driven by the workflow, as on orders.
  - `requiredTemplateId`: the approval the link demanded at submit.
- `FileUpload.formSubmissionId` holds files uploaded through the form. Apply copies them to the event's Files.
- The `FORMS` permission resource is event-scoped. VIEW reads the queue; WRITE creates links, applies and rejects. Apply also needs WRITE on every resource it touches (FUNCTIONS, CATERING_ORDERS), because the cores check it as the reviewer.

## Code map

| Piece | Where |
|---|---|
| Labels, payload/baseline types, diff types | `src/lib/forms/meta.ts` (client-safe) |
| The `FormModule` contract | `src/lib/forms/types.ts` |
| Registry (`formModule(type)`) | `src/lib/forms/index.ts` |
| Function Review | `src/lib/forms/functionReview.ts` |
| Item Request (open link) | `src/lib/forms/itemRequest.ts` |
| Exhibit Request (open link) | `src/lib/forms/exhibitRequest.ts` |
| Presentation Deliverables | `src/lib/forms/presentationDeliverables.ts` |
| Speaker Profile | `src/lib/forms/speakerProfile.ts`; staff side `src/app/events/speakers/` |
| Reviewer contact choice (new / existing / skip) | `src/lib/forms/contacts.ts` |
| Token lookup, throttle, draft lookup, purge | `src/lib/forms/links.ts` |
| Public cores (draft, submit, upload, discard) | `src/lib/forms/publicCore.ts` |
| Public page, actions, upload route | `src/app/f/[token]/` |
| Staff cores and actions | `src/app/events/forms/{core,actions}.ts` |
| Queue and review pages | `src/app/events/[id]/forms/` |
| Link dialog | `src/app/events/forms/FormLinkButton.tsx`; `FormLinkEntry.tsx` (server wrapper every entry page mounts); `ExhibitLinkFields.tsx` |
| Shared public form frame | `src/app/f/[token]/FormParts.tsx` |

## Form types

| Type | Link target | Apply writes |
|---|---|---|
| Function Review | a function (+ recipient contact) | ESG fields, description, catering count/dietary, on-site contact; change requests onto the function's notes |
| Item Request | none (open link; from Forms, Print Orders, Supply Orders) | one item per line on a new or chosen print/supply order; procure → TO_PROCURE, shipping → DROP_SHIP + IN_TRANSIT, bringing → ON_HAND |
| Exhibit Request | none, or one booth group (open link; from Forms, Exhibits) | a booth (company, type, location, shipping/customs, electrical/AV), its contact per the reviewer's choice, its equipment lines (items the exhibitor brings are noted on the line) |
| Presentation Deliverables | a presentation (+ one of its speakers) | title/description (whole-row update rebuilt from the current row), AV needs appended to internalNotes, a MediaDeliverable linked to the presentation and speaker (files filed on it; large media come as a link, stored as text), a handout item on the presentation's single print order |
| Speaker Profile | a presentation + one of its speakers (required) | the speaker columns on that Contact (bio, job title, pronouns, website, headshot) and this event's `SpeakerProfile` (travel, needs) |

A Presentation Deliverables link can carry a **media upload link** (`config.mediaUploadUrl`, https only: any upload location the team hosts — a shared drive folder, a file request, an internal upload tool). With one set, the form sends presenters there with an "I've uploaded my files" box, shows no uploader, and the upload route refuses that link's files. The deliverable's notes record the folder. Modules opt in with `externalUpload`.

Every module's `snapshot().version` changes when a column it can write changes. The public form posts it back, and so does the review page, where `applyFormSubmissionCore` refuses on a mismatch. A stale submit or save keeps the answers: the form also posts the baseline it rendered against (JSON, size-capped, malformed → `invalid`), `keepStaleAnswersCore` parses the answers against the current snapshot and saves them as the draft over that posted baseline, and the page's rebase brings in the staff changes (`?error=stale`). Answers that no longer parse are dropped as before (`?error=changed`). Create-only forms use a constant. Reviewer decisions per section arrive as `choice_<key>` (`ReviewChoice` in `types.ts`).

## Security rules

These are binding for every new form type.

- **Public actions take `(token, formData)` and re-resolve the token in every export.** Tenant, event and target come from the link. The draft is found by an HttpOnly cookie scoped to `/f/<token>`, and every lookup includes `formLinkId` and `state: DRAFT`. Never import a staff `actions.ts` or `src/app/events/reports/data.ts` into `src/app/f/`.
- **The page passes a public DTO**, never the `FormLink` row: its label, recipient email and workflow would serialize into the RSC payload.
- **The projection is an explicit `select` allow-list.** No billing, cost center, internal notes, vendors, pricing, or contact details.
- **Apply writes only plain-text and integer columns**, and only fields the submitter changed. It runs behind a compare-and-set on the target's `updatedAt` as of when the review rendered. Rich-text columns are forbidden for public input.
- **No silent contact match.** The reviewer creates a new contact (the default) or links an existing one, and an existing contact is never updated from public input.
  - *The one exception* is Speaker Profile: it updates the contact staff bound to the link, and only its speaker columns (`updateContactSpeakerFieldsCore` never touches name, email, phone or organization), only fields the submitter changed, under the version check. Bio is plain text. Travel and needs are never prefilled on the public page (a forwarded link must not reveal where a speaker is staying), so a blank answer means "no change".
- **Approval gate.** Apply refuses while any workflow on the submission is incomplete, or when the required one was removed. It checks before and after claiming the row.
- **Honeypot name.** `HONEYPOT_FIELD` must never match a real field name: `FormData.get` returns the first match.
- **Abuse limits:**
  - per link: 20 rows an hour and 50 open drafts (`assertLinkHasCapacity`)
  - save, submit and upload requests: 100 an hour per IP and 300 an hour per link, in memory (`formRequestAllowed`, `src/lib/rateLimit.ts`); over either answers `busy` (429 from the upload route)
  - `maxSubmissions`, enforced in SQL by `claimSubmissionSlot`
  - uploads: 20 MB per file, 10 files / 60 MB per submission, 200 MB per link-hour
  - a honeypot field
  - drafts are purged after 14 days; rejected and withdrawn submissions after 90
- **Uploads.** The upload route checks the Origin header and Content-Length before parsing. The file type comes from its magic bytes (`sniffPublicUpload`), not from the client.
- **Email never carries submitter text.** Receipts go only to the link's `recipientEmail`.
- **Headers.** `/f/*` sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`. `/api/files` sends `nosniff`.

To add a form type, see [checklists/adding-form-type.md](./checklists/adding-form-type.md).

## MCP

`src/lib/mcpTools/forms.ts`:

- `list_form_links`, `create_form_link`, `revoke_form_link`, `delete_form_link` manage links. `create_form_link` takes `functionIds` and `alsoFormTypes` for a bundle and `options` for Exhibit Request settings.
- `list_form_submissions` and `get_form_submission` read the queue.
- `apply_form_submission` and `reject_form_submission` act on a submission.

All of them go through the same cores as the UI. Three things differ from the UI:

- `get_form_submission` returns everything a submitter wrote under `untrusted_submitter_content` and says so in its description.
- `apply_form_submission` requires explicit `sections` and the `version` from `get_form_submission`.
- There is no apply-all default.

The event sidebar's Forms link shows the open-submission count.

The public page's `generateMetadata` sets the title and Open Graph tags to the form name and target (the bundle's heading for a bundle, via `formsHeading`), so a link pasted into iMessage or Slack previews as the form, not the app.
