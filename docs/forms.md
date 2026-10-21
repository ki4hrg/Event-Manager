# Public forms

Tokenized links (`/f/<token>`) that people without an account fill in: a function sponsor confirming setup details today, presenters, exhibitors and requesters later. Nothing a submitter sends writes to live records. It lands in a review queue (`/events/[id]/forms`). There, staff see a diff against the record, optionally wait for an approval workflow to finish, and apply it section by section.

## Model

- `FormLink` holds the token (256-bit, `generateShareToken`), tenant, event, `formType`, and an optional target (`functionId`). It also holds the recipient, `config` (`{ sections, intro }`), `workflowTemplateId` (the approval workflow), `dueAt`, a required `expiresAt`, `maxSubmissions` and `submittedCount`.
- `FormSubmission` moves through the states DRAFT → SUBMITTED → APPLIED / REJECTED (or DRAFT → WITHDRAWN). It holds:
  - `payload`: the typed answers.
  - `baseline`: the public projection the submitter saw.
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
| Reviewer contact choice (new / existing / skip) | `src/lib/forms/contacts.ts` |
| Token lookup, throttle, draft lookup, purge | `src/lib/forms/links.ts` |
| Public cores (draft, submit, upload, discard) | `src/lib/forms/publicCore.ts` |
| Public page, actions, upload route | `src/app/f/[token]/` |
| Staff cores and actions | `src/app/events/forms/{core,actions}.ts` |
| Queue and review pages | `src/app/events/[id]/forms/` |
| Link dialog | `src/app/events/forms/FormLinkButton.tsx`; `OpenFormLinkButton.tsx` for open forms |
| Shared public form frame | `src/app/f/[token]/FormParts.tsx` |

## Form types

| Type | Link target | Apply writes |
|---|---|---|
| Function Review | a function (+ recipient contact) | ESG fields, description, catering count/dietary, on-site contact; change requests onto the function's notes |
| Item Request | none (open link; from Forms, Print Orders, Supply Orders) | one item per line on a new or chosen print/supply order; procure → TO_PROCURE, shipping → DROP_SHIP + IN_TRANSIT, bringing → ON_HAND |

Every module's `snapshot().version` changes when a column it can write changes. The public form posts it back (stale → `?error=stale`), and so does the review page, where `applyFormSubmissionCore` refuses on a mismatch. Create-only forms use a constant. Reviewer decisions per section arrive as `choice_<key>` (`ReviewChoice` in `types.ts`).

## Security rules

These are binding for every new form type.

- **Public actions take `(token, formData)` and re-resolve the token in every export.** Tenant, event and target come from the link. The draft is found by an HttpOnly cookie scoped to `/f/<token>`, and every lookup includes `formLinkId` and `state: DRAFT`. Never import a staff `actions.ts` or `src/app/events/reports/actions.ts` into `src/app/f/`.
- **The page passes a public DTO**, never the `FormLink` row: its label, recipient email and workflow would serialize into the RSC payload.
- **The projection is an explicit `select` allow-list.** No billing, cost center, internal notes, vendors, pricing, or contact details.
- **Apply writes only plain-text and integer columns**, and only fields the submitter changed. It runs behind a compare-and-set on the target's `updatedAt` as of when the review rendered. Rich-text columns are forbidden for public input.
- **No silent contact match.** The reviewer creates a new contact (the default) or links an existing one, and an existing contact is never updated from public input.
- **Approval gate.** Apply refuses while any workflow on the submission is incomplete, or when the required one was removed. It checks before and after claiming the row.
- **Abuse limits:**
  - per link: 20 rows an hour and 50 open drafts (`assertLinkHasCapacity`)
  - `maxSubmissions`, enforced in SQL by `claimSubmissionSlot`
  - uploads: 20 MB per file, 10 files / 60 MB per submission, 200 MB per link-hour
  - a honeypot field
  - drafts are purged after 14 days; rejected and withdrawn submissions after 90
- **Uploads.** The upload route checks the Origin header and Content-Length before parsing. The file type comes from its magic bytes (`sniffPublicUpload`), not from the client.
- **Email never carries submitter text.** Receipts go only to the link's `recipientEmail`.
- **Headers.** `/f/*` sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`. `/api/files` sends `nosniff`.

To add a form type, see [checklists/adding-form-type.md](./checklists/adding-form-type.md).
