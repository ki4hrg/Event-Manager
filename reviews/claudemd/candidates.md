# CLAUDE.md candidates

Parking lot for rule additions, sharpenings, and corrections noticed during a task. Format: `- [area] one-line description (PR/file reference if relevant)`. Processed by `reviews/claudemd/prompts/00-apply-candidates.md`; last swept 2026-09-11 (see `changelog.md`).

- [styling] `btnPrimarySm` (`px-3 py-1.5 text-sm rounded`) is the canonical small primary button (77 of 83 inline sites used `py-1.5`; the `py-1` spellings were drift). Remaining inline blue buttons of other shapes (`px-3 py-2 rounded-md` medium in LinkedItemsPanel/PrintOrderPanel/CateringOrderPanel/AVOrderFunctionList, `px-2 text-xs` tiny, `px-4 py-1.5` in ShareReportButton) are candidates for further constants, not `btnPrimary*`. (src/lib/buttonStyles.ts)
