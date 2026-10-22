# Adding a new entity / order type

When introducing a new order-type or top-level entity, wire it into every shared surface below — most are easy to miss because they don't fail the build (the new value just doesn't appear). Cross-reference SupplyOrder (commit a880f43 + the SupplyOrder UI alignment PR) as the most recent end-to-end reference.

Mark a surface ✗ if it's relevant to the new entity but not yet wired. Some lines won't apply to every entity (e.g. an entity without equipment items skips Equipment Responsibility) — judgement call, but bias toward including unless there's a clear reason not to.

## Schema / database
- `prisma/schema.prisma` — model, relations, `onDelete` cascades, junction tables (use `functionLinks` / `presentationLinks` naming, not `functions` / `presentations` — see refactor candidates), indexes
- `StatusModelType` enum — entry for the new entity (drives status defaults)
- `EntityStatus?` field on the model if it has a workflow status
- `FileUpload` model — add an optional FK + index if the entity supports attachments
- `prisma/tenantDefaults.mjs` — seed any default options the entity depends on (per tenant; the seed and tenant creation both run it)
- Tenant scoping — a new *top-level* entity needs `tenantId` + `tenant` relation + `@@index([tenantId])`, a back-relation on `Tenant`, and a backfill migration; event-scoped children inherit the tenant through the event. See `docs/multi-tenancy.md`

## Auth and permissions
- `src/app/users/roles/resources.ts` — add a `PermissionResource` entry to `GLOBAL_ONLY_RESOURCES` or `EVENT_SCOPED_RESOURCES`; mirror it in `prisma/seed.mjs` (`NON_EVENT_RESOURCES` / `EVENT_RESOURCES`, plus `ADMIN_ONLY_RESOURCES` if the default User role shouldn't get it) — the seed runs outside the Next runtime and can't import the TS module
- A new resource reaches the system roles on the next seed run, but user-created roles get no row (NONE) — note in the PR that admins must grant it by hand after deploy
- Server Actions: every exported action starts with `await requirePermission(RESOURCE, ACTION, eventId?)`; global checks return `session.tenantId` for the `*Core` call, event-scoped checks derive the tenant from the event

## Routes
- `src/app/events/<entity>/` — colocated `actions.ts` + list/form/panel components (Archetypes A–C in CLAUDE.md § Route archetypes)
- `src/app/events/[id]/<entity>/page.tsx` — list page (`force-dynamic`)
- `src/app/events/[id]/<entity>/new/page.tsx` — create page
- `src/app/events/[id]/<entity>/[entityId]/page.tsx` — detail page with `<Breadcrumbs>` and inline `"use server"` wrapper actions
- Redirect convention: thin top-level entities → list view after create; entities needing further setup → detail view after create; duplicates and updates → detail view (see CLAUDE.md § Server Actions § Redirect target)

## Sidebar / navigation
- `src/components/EventSidebar.tsx` — `NAV` array entry under the right group (Schedule / Content / Orders / Resources / Reports / Configuration), `getActiveSection` `sections` array, icon (add a new one if no existing icon fits — don't reuse a semantically-different icon)
- `src/app/events/sidebar-actions.ts` — `SidebarSection` union entry + `getSidebarItems` branch returning the entity's links

## Overview / dashboard
- `src/app/events/[id]/actions.ts` — `getEventOverviewStats()` permission checks, fetches, attention items, entity card
- `src/app/events/[id]/page.tsx` — render the new card (if the overview renders cards inline)

## Status / workflow
- `src/lib/statusConstants.ts` — `STATUS_MODEL_LABEL` entry; promote any entity-specific status enums (e.g. `PACKING_STATUS_LABEL`, `ACQUISITION_LABEL`) here once they're consumed beyond the entity's own folder
- `src/app/events/status-defaults/StatusDefaultsPanel.tsx` — `ALL_MODEL_TYPES` array
- `src/app/events/workflows/actions.ts` — `WorkflowEntityType` union + five switch arms (`entityResource`, `assertEntityInEvent`, `filterEntityIdsInEvent`, `revalidateEntity`, `updateEntityStatus`). Each switch covers the full union; some are caught by TS inference if a member is missing, but not all — audit by hand when adding a member

## Vendor model types
- `src/app/vendors/actions.ts` — `ModelType` union entry
- `src/app/vendors/model-types.ts` — `MODEL_TYPES` array entry (drives vendor picker filtering across the order forms)
- `src/lib/responsibleParties.ts` — `ResponsiblePartyModelType` union + exhaustiveness arm; required for the `getResponsiblePartyVendors` + `flattenResponsiblePartyOptions` pattern used in every order form's vendor picker

## Uploads
- `src/lib/uploads.ts` — `ENTITY_DIRS` entry, `getEntityTypeFromRecord` check, `resolveEntityEventId` switch arm

## Reports — existing ones the entity should flow through
- `src/app/events/reports/data.ts`:
  - `getFunctionDetailData` `fdFunctionInclude` + nested presentation include — add `<entity>Links` (or whichever relation exists on Function/Presentation)
  - `getEquipmentResponsibilityData` — widen `modelType` unions and add a normalization loop if the entity carries equipment items
  - `getVendorHandoffData` — fetch the entity's records when the vendor is provider (order-level OR per-item); update `relevantModelTypes`; shape into the return payload
  - `getOrderAssignedVendors` — add the entity's vendor relation to the union
- Each report's `*Report.tsx` body — render the new section (mobile cards + desktop table; see CLAUDE.md § Reports § Required: mobile-friendly tables)

## Share-view integration (only if you add a NEW report for this entity)
Five surfaces — see [share-report-integration.md](./share-report-integration.md).

## Bulk edit (only if the entity ships with bulk operations)
Follow CLAUDE.md § Order list and bulk edit pattern — selection state, bulk panel (status / substatus / vendor / function link / presentation link), null sentinels.
