# Code Quality Review — 2026-05-15

## Findings

> **Q1** Outdated TODO comment about duplicated color class maps  
> **Severity:** Low  
> **Location:** `src/app/events/[id]/agenda/AgendaGrid.tsx:96-97`  
> **Issue:** The TODO references duplicating color class maps in ScheduleList.tsx, FunctionList.tsx, PresentationList.tsx, and OptionList.tsx. In reality, ScheduleList and FunctionTableView import from `src/lib/colors.ts`, and the unique `entryColorClasses` map in AgendaGrid is a specialized variant with additional `handle` and `handleHover` keys. The TODO is inaccurate and may cause confusion if someone tries to act on it.  
> **Evidence:**  
> ```tsx
> // TODO: Extract shared color class maps to src/lib/colorUtils.ts — duplicated in
> // ScheduleList.tsx, FunctionList.tsx, PresentationList.tsx, and OptionList.tsx
> const entryColorClasses: Record<string, { bg: string; title: string; text: string; handle: string; handleHover: string }> = {
>   blue:   { bg: "bg-blue-50 dark:bg-blue-950", ... handle: "bg-blue-300 dark:bg-blue-600", handleHover: "group-hover/handle:bg-blue-500 dark:group-hover/handle:bg-blue-400" },
>   ...
> };
> ```  
> Only AgendaGrid has this map; ScheduleList imports `colorClasses` from colors.ts. The variant is too specialized (includes drag-handle colors) to fold into the shared lib without changing the existing `colorClasses` structure.  
> **Suggested approach:** Either extract `entryColorClasses` to a dedicated file (e.g., `src/lib/agendaColorUtils.ts`) if reuse is anticipated, or remove the TODO and add a comment explaining why this map is separate from `src/lib/colors.ts`.  
> **Confidence:** High

---

> **Q2** Large component with multiple mode branches  
> **Severity:** Low  
> **Location:** `src/app/events/print-orders/PrintOrderPanel.tsx:105-235`  
> **Issue:** The `PrintOrderPanel` component is 131 lines with three distinct modes ("function", "presentation") branching at the top level. While this follows the established pattern seen in `VendorLinkControl.tsx` and other components, the multiple branches combined with state management (showLinkForm, etc.) and nested form rendering create a component with multiple responsibilities.  
> **Evidence:**  
> ```tsx
> export function PrintOrderPanel(props: Props) {
>   const [showLinkForm, setShowLinkForm] = useState(false);
>   
>   if (props.mode === "function") {
>     // 50+ lines of function-mode UI
>   }
>   
>   if (props.mode === "presentation") {
>     // 50+ lines of presentation-mode UI
>   }
> }
> ```  
> **Suggested approach:** This pattern is used intentionally in the codebase (documented in CLAUDE.md examples for props-based branching). No refactor is needed unless the component grows significantly beyond ~150 lines or gains a third mode that would benefit decomposition.  
> **Confidence:** Medium — the codebase permits this pattern; only flagging for future reference if maintenance burden increases.

---

> **Q3** Large report aggregation function with nested loops  
> **Severity:** Low  
> **Location:** `src/app/events/[id]/reports/vendor-handoff/VendorHandoffReport.tsx:254-330`  
> **Issue:** The `buildEquipmentSummary` function is 77 lines with deeply nested loops (catering, av, setup orders; audio section input groups and monitor mixes; setup order tables). While the logic is clear, the function is long enough that refactoring nested data extraction into helpers could improve readability.  
> **Evidence:**  
> ```tsx
> function buildEquipmentSummary(data: HandoffData, vendorId: string): EquipmentSummaryRow[] {
>   // ... 25 lines of setup ...
>   for (const order of data.cateringOrders) addItems(...);
>   for (const order of data.avOrders) {
>     // ... 10 lines ...
>     if (order.audioSection) {
>       for (const group of order.audioSection.inputGroups) {
>         for (const inputItem of group.inputItems) {
>           addRow(...);
>         }
>       }
>     }
>   }
>   // ... more loops ...
> }
> ```  
> **Suggested approach:** Extract nested order processing into separate `addCateringItems(...)`, `addAVOrderItems(...)`, and `addSetupOrderItems(...)` functions that call the shared `addRow` and `addItems` closures. This would flatten the nesting and make each order type's extraction logic self-contained.  
> **Confidence:** Medium — refactor would improve scannability but isn't critical for correctness.

---

> **Q4** Large action file combining multiple report types  
> **Severity:** Low  
> **Location:** `src/app/events/reports/actions.ts:1-1013`  
> **Issue:** The file is 1013 lines and contains four major report data functions (`getEquipmentResponsibilityData`, `getEventProfileData`, `getVendorHandoffData`, `getRoomScheduleData`) plus shared helpers (`extractWindows`, `getOrderFns`, `expandByFunction`, `calculatePeak`). While each function is cohesive, they're independent reports that could live in separate files without losing clarity.  
> **Evidence:**  
> - Equipment report: lines 66-575 (helpers + main function)  
> - Event profile report: lines 580-728  
> - Vendor handoff: lines 731-915  
> - Room schedule: lines 921-1013  
> **Suggested approach:** This is an intentional choice per CLAUDE.md architecture: report-level action files colocate related data fetchers to avoid scattered DB queries. No refactor needed unless the file exceeds ~1500 lines or gains significant report-specific logic that wouldn't benefit from cross-report utilities.  
> **Confidence:** Low — the current organization follows project conventions; flagging for future reference if new reports are added.

---

## Summary

- **Total findings:** 4  
- **Critical:** 0  
- **High:** 0  
- **Medium:** 2 (one about refactoring, one architectural decision)  
- **Low:** 2 (one outdated TODO, one large-but-intentional component)

No bugs or security issues detected. No CLAUDE.md violations. All exports are referenced; no dead code found.
