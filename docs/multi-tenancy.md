# Multi-tenancy

Every domain row belongs to a **Tenant** (shown in the UI as an *organization*). Users and role definitions are global, so one login can belong to several tenants with a different role in each.

## Data model

| Global | Per tenant |
|---|---|
| `User`, `Role`, `RolePermission`, `ApiKey`, OAuth tables, `UserSetting` | `Event`, `EventSeries`, `Venue`, `Contact`, `Vendor`, `CustomOption`, `Equipment`, `StorageLocation`, `InventoryItem`, `WorkflowTemplate` (and everything hanging off an event: functions, orders, files, share links, …) |

- `Tenant { id, name, slug }` — `slug` is the handle the MCP `tenant` argument accepts.
- `TenantMembership { tenantId, userId, roleId }` — the only way a user gets permissions inside a tenant. The old `User.roleId` is gone.
- `User.isSuperAdmin` — platform administrator: every permission in every tenant, plus `/tenants` (create organizations, manage any membership). Roles are global definitions, so editing a role is also super-admin only; tenant admins can read the matrix and assign roles.
- Uniqueness that used to be global is now per tenant: `EventSeries.name`, `CustomOption (category, label)`, `Equipment (category, name)`.

## How the tenant is chosen

- **Active tenant** (`src/lib/tenant.ts`): a `UserSetting` (`active_tenant_id`) switched from the header. Falls back to the user's first membership. A signed-in user with no membership lands on `/no-tenant`.
- **Global checks** (`requirePermission(RESOURCE, action)` with no event id) resolve against the active tenant and return `session.tenantId`, which Server Actions hand to the `*Core` functions.
- **Event-scoped checks** (`requirePermission(RESOURCE, action, eventId)`) resolve against the *event's* tenant, whatever the active tenant is. Opening another organization's event re-points the active tenant (see `src/app/events/[id]/layout.tsx`).
- **Principal-aware** callers (`requirePermissionForUser`, cores, MCP) pass a `PermissionTarget`: an event id string, or `{ tenantId }` for a global check.
- **MCP**: an API key spans every tenant its user belongs to. Every tool except `list_tenants` takes a `tenant` argument (slug or id); it may be omitted only when the user belongs to exactly one. The dispatcher (`src/app/mcp/route.ts`) resolves it and strips it before the handler runs.
- **Share links** carry their tenant through the event; the unauthenticated routes read options via `getOptionsForTenant` / `getOptionsForEvent` in `src/lib/options.ts`.

## Writing tenant-safe code

- Every `findMany` / `findFirst` on a tenant-owned model includes `tenantId` (or a `tenant: { events: { some: { id: eventId } } }` relation filter when only an event id is at hand).
- Every `create` sets `tenantId`. Every `update` / `delete` by id uses `where: { id, tenantId }` so a foreign id is a not-found, never a cross-tenant write.
- Child rows (rooms, vendor contacts, workflow steps) are reached through their parent; assert the parent is the tenant's own first (`assertVenueInTenant`, `assertVendorInTenant`, `assertTemplateInTenant`).
- New tenants get their defaults from `prisma/tenantDefaults.mjs` (shared with the seed). Add new default options or equipment there, not in `seed.mjs`.

## Migration and deploy

The schema change ships as Prisma migrations (`prisma/migrations/`), not `db push`:

- `0_init` is the pre-tenant schema as a baseline. `prisma/baseline.mjs` marks it applied on databases that were built with `db push`, so `prisma migrate deploy` doesn't try to re-create existing tables.
- `20260904000000_multi_tenant` creates a **Default** tenant (`slug = default`), attaches every existing row to it, turns each user's old role into a membership there, and promotes holders of the system Admin role to super admin.
- The Docker CMD is now `node prisma/baseline.mjs && npx prisma migrate deploy && node prisma/seed.mjs && npm run start`. Locally use `npm run db:migrate` (dev) or `npm run db:deploy`.
