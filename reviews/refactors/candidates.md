# Refactor candidates

Parking lot for refactors flagged during a `/simplify` (or ad-hoc) review pass that are real and worth doing but too big to bundle with the change in flight. Processed during periodic refactor sweeps.

Format: `- [area] one-line description (file references, originating PR/commit if useful)`

## Open

- [vendors] `VendorPanel.tsx` and `VendorLinkControl.tsx` both derive `unassignedVendors` from `(availableVendors, assignedVendors)` and render a `<select>` of "Select vendor... + per-vendor option" — same shape, different surrounding flows (notes/no-notes, immediate-select vs explicit-Add, model-badges in option text). At a third occurrence, extract a shared `getUnassignedVendors()` helper in `src/app/vendors/vendor-utils.ts` and a `<VendorAddDropdown>` primitive. (commit 4c34e19)
- [party-label] `src/app/events/av-orders/AVOrderDetails.tsx:11-18` has a local `partyLabel` with a different return contract (`string` with `"—"` fallback) vs the canonical `src/lib/partyLabel.ts` (`string | null`). `src/app/events/[id]/reports/vendor-handoff/VendorHandoffReport.tsx` has a local `partyName` with the same `"—"`-fallback contract. Migrating means touching all call sites to append `?? "—"`. The verbatim-duplicate `vendorOrContactName` in `FunctionDetailReport.tsx` was migrated to `@/lib/partyLabel` already; AVOrderDetails and VendorHandoffReport are the remaining holdouts. Originating from /simplify pass after the `partyLabel` extraction (post-f1c8adf RSC proxy bug fix).

## Resolved

<!-- Move entries here once landed, with the commit hash. Prune entries older than ~6 months. -->
