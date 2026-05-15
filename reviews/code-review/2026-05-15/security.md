# Security Review — Event Manager

Date: 2026-05-15

## CRITICAL FINDINGS

### S-001: Missing authentication on public-facing API route for file downloads
**Severity:** Critical
**Location:** `src/app/api/files/[fileId]/route.ts:6-38`
**Issue:** The file download endpoint does not perform any authentication or authorization check. Any user (authenticated or not) can download any file by ID. This bypasses the Single-tenant model and allows unauthorized access to sensitive event documents, vendor contracts, catering menus, and other confidential files.
**Evidence:**
```ts
export async function GET(
  _request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const record = await prisma.fileUpload.findUnique({
    where: { id: params.fileId },
  });
  // ... no authentication check before reading file
```
CLAUDE.md states: "Every authenticated page can assume `session.user` exists" and auth is "defense-in-depth." This route lacks any check.
**Suggested approach:** Add `await requireAuth()` at the entry point; ideally also validate that the session user has access to the event/entity the file is attached to.
**Confidence:** High

### S-002: Missing authentication on file upload endpoint
**Severity:** Critical
**Location:** `src/app/api/upload/route.ts:8-62`
**Issue:** The file upload endpoint does not perform authentication. Any unauthenticated or authenticated user can upload files to any entity by specifying the entity type and ID. An attacker can pollute the system with malicious files, upload oversized files, or associate files with resources they should not have access to.
**Evidence:**
```ts
export async function POST(request: NextRequest) {
  // ... no requireAuth() call
  const entityType = formData.get("entityType") as string | null;
  const entityId = formData.get("entityId") as string | null;
  // ... proceeds to write file to disk
```
**Suggested approach:** Add `await requireAuth()` first; then validate that the authenticated user has permission to write to the requested entity (eventId, venueId, etc.). Also add file-size limits.
**Confidence:** High

### S-003: Majority of Server Actions lack authentication guards
**Severity:** Critical
**Location:** `src/app/*/actions.ts` — 18 out of 22 actions files lack `requireAuth()` or `requireAdmin()` at entry points
**Issue:** CLAUDE.md mandates: "Every exported action starts with `await requireAuth()` or `await requireAdmin()`" for defense-in-depth. However, critical mutations lack these guards:
- `src/app/events/actions.ts`: `createEvent`, `updateEvent`, `deleteEvent` (and ~9 other functions)
- `src/app/contacts/actions.ts`: `createContact`, `updateContact`, `deleteContact`
- `src/app/venues/actions.ts`: `createVenue`, `updateVenue`, `deleteVenue`
- `src/app/vendors/actions.ts`: `createVendor`, `updateVendor`, `deleteVendor`
- `src/app/events/presentations/actions.ts`: `createTrack`, `updateTrack`, etc.
- `src/app/events/functions/actions.ts`: `createFunction`, `updateFunction`, etc.
- `src/app/events/catering-orders/actions.ts`: All mutations
- `src/app/events/av-orders/actions.ts`: All mutations
- `src/app/events/print-orders/actions.ts`: All mutations
- `src/app/events/setup-orders/actions.ts`: All mutations
- `src/app/files/actions.ts`: `deleteFile` (no auth)

Middleware enforces auth at route level, but the CLAUDE.md rule exists for defense-in-depth — any refactoring that bypasses middleware or any Server Action called from an authorized context that shouldn't be would expose these.
**Evidence:**
From `src/app/events/actions.ts:22-43`:
```ts
export async function createEvent(formData: FormData) {
  const name = formData.get("name") as string;
  // ... no await requireAuth() here
  const event = await prisma.event.create({
```
From `src/app/contacts/actions.ts:19-42`:
```ts
export async function createContact(formData: FormData) {
  const firstName = formData.get("firstName") as string;
  // ... no auth check
  const contact = await prisma.contact.create({
```
**Suggested approach:** Audit all 22 action files; add `await requireAuth()` as the first line of every exported action, except for the read-only report actions in `src/app/events/reports/actions.ts` (which are deliberately auth-free for share-link use). This is a systematic issue, not an edge case.
**Confidence:** High

---

## HIGH-SEVERITY FINDINGS

### S-004: No async params await in file route
**Severity:** High
**Location:** `src/app/api/files/[fileId]/route.ts:7-9`
**Issue:** The route handler destructures `params` without awaiting it. Next.js 14+ requires `params: Promise<{...}>` to be awaited. While the current code may work due to loose typing, it violates the App Router contract and could fail in edge cases or future Next.js versions.
**Evidence:**
```ts
export async function GET(
  _request: NextRequest,
  { params }: { params: { fileId: string } }  // Missing Promise<...> type
) {
  const record = await prisma.fileUpload.findUnique({
    where: { id: params.fileId },  // Using params directly
```
CLAUDE.md states: "Type page props as `params: Promise<{...}>` and `searchParams: Promise<{...}>`, then `await` them."
**Suggested approach:** Change params to `params: Promise<{ fileId: string }>`, then `const { fileId } = await params;`.
**Confidence:** High

### S-005: File upload missing entityId authorization validation
**Severity:** High
**Location:** `src/app/api/upload/route.ts:14-32`
**Issue:** Even after adding auth, the endpoint trusts the client-supplied `entityId` without verifying the authenticated user has access to that entity. An authenticated user could upload files to an event they don't belong to.
**Evidence:**
```ts
const entityId = formData.get("entityId") as string | null;
// ... no validation that user can access this event/entity
await prisma.fileUpload.create({
  data: {
    fileName: file.name,
    [ENTITY_FK_FIELD[validEntityType]]: entityId,
  },
});
```
**Suggested approach:** After `requireAuth()`, validate the entityId against the event/entity the user has access to (cross-reference the session's permission model).
**Confidence:** High

### S-006: File download missing entity ownership validation
**Severity:** High
**Location:** `src/app/api/files/[fileId]/route.ts:10-16`
**Issue:** After adding auth, the endpoint still does not verify the authenticated user has access to the entity the file is attached to. A user logged into one event could download files from another event.
**Evidence:**
```ts
const record = await prisma.fileUpload.findUnique({
  where: { id: params.fileId },
});
// ... no check that user can access the associated event/entity
```
**Suggested approach:** After `requireAuth()`, fetch the file record and its associated entity (event, venue, etc.), then verify the session user has permission to access that entity.
**Confidence:** High

### S-007: File upload missing file-size limit
**Severity:** High
**Location:** `src/app/api/upload/route.ts:18-20`
**Issue:** The endpoint checks for empty files but not for oversized uploads. An attacker could upload extremely large files, causing disk exhaustion and denial of service.
**Evidence:**
```ts
if (!file || file.size === 0) {
  return NextResponse.json({ error: "No file provided" }, { status: 400 });
}
// ... no check for MAX_FILE_SIZE
```
**Suggested approach:** Add a maximum file-size constant (e.g., 100 MB) and reject uploads that exceed it before writing to disk.
**Confidence:** High

### S-008: MIME type not validated on upload
**Severity:** High
**Location:** `src/app/api/upload/route.ts:42`
**Issue:** The endpoint trusts the client-supplied `file.type`. An attacker could upload an executable or malicious file disguised with a benign MIME type.
**Evidence:**
```ts
mimeType: file.type || "application/octet-stream",
```
**Suggested approach:** Validate MIME types against an allowlist (e.g., PDF, image formats, Office documents). Perform server-side magic-number checks (e.g., checking file headers) to confirm the actual file type matches the claimed type.
**Confidence:** High

### S-009: File path constructed with user input without traversal check
**Severity:** Medium
**Location:** `src/app/api/upload/route.ts:29-30`
**Issue:** The stored filename is generated with UUID and extension, which is safe; however, the entityId is directly used in `getUploadDir()` without validation that it doesn't contain path traversal sequences.
**Evidence:**
```ts
const ext = path.extname(file.name);
const storedName = `${randomUUID()}${ext}`;
const uploadDir = getUploadDir(validEntityType, entityId);  // entityId not sanitized
```
From `src/lib/uploads.ts:41-42`:
```ts
export function getUploadDir(entityType: EntityType, entityId: string): string {
  return path.join(UPLOAD_DIR, ENTITY_DIRS[entityType], entityId);  // path traversal possible
}
```
If entityId is `../../etc/passwd`, the resulting path could escape the upload directory.
**Suggested approach:** Validate that `entityId` is a valid UUID or alphanumeric identifier (matches the database constraint). Reject any entityId containing path separators or special characters.
**Confidence:** Medium

---

## MEDIUM-SEVERITY FINDINGS

### S-010: Share link token generation uses crypto.randomBytes but no length specification
**Severity:** Low
**Location:** `src/lib/shareLinks.ts:13-15`
**Issue:** While `crypto.randomBytes(32)` is cryptographically secure, the size is hardcoded with no documentation or justification. 32 bytes (256 bits) is reasonable for a token, but should be explicit.
**Evidence:**
```ts
export function generateShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
```
**Suggested approach:** This is acceptable. Add a comment explaining the choice (e.g., `// 256 bits of entropy for sharing`).
**Confidence:** Low

### S-011: Share link filters validated only on client side
**Severity:** Medium
**Location:** `src/app/share/[token]/page.tsx:176-179`
**Issue:** When filters are unlocked on a share link, the page validates section IDs client-side against `PROFILE_SECTIONS`. However, other filter arrays (vendors, rooms, days) are split from URL params and used without re-validation against the actual set of valid options for that event. A user could craft URLs with invalid IDs.
**Evidence:**
```ts
const validSectionValues = new Set(PROFILE_SECTIONS.map((s) => s.value));
const validSections = (effectiveSections ?? []).filter((s) =>
  validSectionValues.has(s as ProfileSection)
) as ProfileSection[];
// ... but vendorIds, roomIds, and days are not similarly validated
const printParams = new URLSearchParams();
if (effectiveVendorIds?.length) printParams.set("vendors", effectiveVendorIds.join(","));
```
**Suggested approach:** Validate all filter arrays (vendorIds, roomIds, days) against the actual data fetched (e.g., ensure each vendorId exists in the returned vendors list before rendering).
**Confidence:** Medium

### S-012: File deletion lacks authorization check
**Severity:** Medium
**Location:** `src/app/files/actions.ts:8-25`
**Issue:** The `deleteFile` action lacks both `requireAuth()` and authorization validation. It deletes any file by ID without checking if the caller owns the associated entity.
**Evidence:**
```ts
export async function deleteFile(fileId: string, revalidateTarget: string) {
  // no requireAuth() call
  const record = await prisma.fileUpload.findUnique({
    where: { id: fileId },
  });
  // ... no verification that user can delete this file
  await prisma.fileUpload.delete({ where: { id: fileId } });
}
```
**Suggested approach:** Add `await requireAuth()` at entry; then validate that the authenticated user has permission to delete files from the associated entity.
**Confidence:** High

### S-013: Request parameter passed through without type safety (fileId route)
**Severity:** Medium
**Location:** `src/app/api/files/[fileId]/route.ts:7`
**Issue:** The `params.fileId` is accessed directly without awaiting or type-checking. While UUID validation happens implicitly at the database layer (findUnique returns null for invalid IDs), SQL injection is not possible via the Prisma client, so this is a risk of incorrect behavior rather than injection.
**Suggested approach:** Validate that fileId is a valid UUID format before querying the database.
**Confidence:** Medium

---

## LOW-SEVERITY FINDINGS

### S-014: Error messages may leak system details
**Severity:** Low
**Location:** `src/app/api/upload/route.ts:59`, `src/app/api/files/[fileId]/route.ts:26`
**Issue:** Generic error responses ("Upload failed", "File not found on disk") are appropriate. No evidence of stack trace or internal details leaking found. The project handles errors conservatively.
**Suggested approach:** Continue avoiding error-detail exposure; current practice is sound.
**Confidence:** High

### S-015: User table password field not explicitly marked as sensitive
**Severity:** Low
**Location:** `src/app/users/actions.ts:42-51`
**Issue:** Passwords are hashed with bcrypt before storage, which is correct. However, when fetching users in `getUsers()` and `getUser()`, the code explicitly `select`s fields and excludes the password field, preventing accidental leakage. This is defensive and good.
**Evidence:**
```ts
export async function getUser(id: string) {
  await requireAdmin();
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      // password field explicitly NOT selected
    },
  });
}
```
**Suggested approach:** Continue this pattern. Consider documenting it in a comment.
**Confidence:** High

### S-016: NextAuth session strategy is JWT; ensure token refresh/expiry is enforced
**Severity:** Low
**Location:** `src/lib/auth.ts:60-62`
**Issue:** JWT strategy with 30-day max age is configured. JWTs are stateless; 30 days is long but acceptable for a single-tenant internal tool. However, if a token is leaked, there's a 30-day window of compromise. Consider shorter max age or add manual token rotation.
**Evidence:**
```ts
session: {
  strategy: "jwt",
  maxAge: 30 * 24 * 60 * 60, // 30 days
},
```
**Suggested approach:** This is acceptable for a single-tenant tool. Consider documenting the choice; if JWT is ever replaced with database-backed sessions, this ceiling can be lowered.
**Confidence:** Low

### S-017: `dangerouslySetInnerHTML` used for menu content, source validation unclear
**Severity:** Low
**Location:** `src/app/events/catering-orders/MenuSectionTable.tsx:186`, `CateringOrderDetails.tsx:124`, and 2 other report files
**Issue:** Four uses of `dangerouslySetInnerHTML` render `menuContent` (HTML produced by RichTextEditor). CLAUDE.md permits this only when the HTML comes from RichTextEditor. The source is correct (BEO/catering order data), but there's no explicit comment marking the exception, which could confuse reviewers.
**Evidence:**
```tsx
// MenuSectionTable.tsx:186
<div
  className="text-sm text-gray-900 dark:text-white not-italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
  dangerouslySetInnerHTML={{ __html: section.menuContent }}
/>
```
CLAUDE.md: "`dangerouslySetInnerHTML` is allowed only for HTML produced by `RichTextEditor`".
**Suggested approach:** Add a one-line comment above each call: `// RichTextEditor source—safe` or similar, per CLAUDE.md convention.
**Confidence:** Low

### S-018: SQL injection not a risk (Prisma), but `getUploads` reads user input
**Severity:** Low
**Location:** `src/lib/uploads.ts:41-46`
**Issue:** The `getUploadDir` and `getUploadPath` functions concatenate user-controlled entityId directly into a path. While Prisma prevents SQL injection, path traversal is possible if entityId is not validated.
**Suggested approach:** See S-009. Validate entityId format before use.
**Confidence:** Medium

---

## SUMMARY

**Critical issues:** 3 (missing auth on file upload/download, missing auth on majority of Server Actions)
**High-severity issues:** 6 (async params, entity validation, MIME type, file size, path traversal, file deletion)
**Medium-severity issues:** 4 (filter validation, parameter validation, path traversal validation, error handling)
**Low-severity issues:** 5 (documentation, minor config)

### Immediate actions:
1. Add `requireAuth()` to all file upload/download routes.
2. Add validation to ensure authenticated users only access their own events/entities.
3. Add `requireAuth()` guards to all 18 action files that lack them (systematic fix).
4. Add file-size limits and MIME-type validation to upload endpoint.
5. Validate entityId and fileId formats to prevent path traversal.
