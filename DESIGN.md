# Event Manager Design Guidelines

The Event Manager app is intended to collect and synthesize large amounts of information, much of which is very detailed, and display it in a user-friendly format. A clean, easy-to-use design is critical, particularly during high-pressure events. This document outlines a general design philosophy to ensure that information is accessible when needed.

## Basic Principles

* Design should prioritize quick access to important information - critical information should not be hidden behind tabs, and should appear high on the screen so the need to scroll is minimized.
* Visual feedback is helpful - the design should make use of features like color-coding, badges, etc. to quickly surface important information.

## Standard Page Layout

### Page Header
Every page uses a shared `PageHeader` component. Detail pages include a breadcrumb trail and the record name as the page title. List pages show just the title. Pages that benefit from a short explanatory subtitle (e.g., Workflows) may include an optional description line below the title. The workflow status badge is the most prominent visual signal on detail pages and should appear directly alongside the title. Action buttons (e.g., Create, Delete) are placed in the header's actions slot on the right.

### Two-Column Layout
The standard layout for Overview tabs is a two-column design with a 33%/67% split left-right. Additional tabs may use more flexible layouts appropriate to their content (e.g., full-width tables, form layouts).

Within those larger sections, information is grouped into card-style subsections. Cards should be logically laid out and grouped.

#### Left Column
The left column should be used for generally static summary and metadata-type information. An example here is the Event Overview screen where the left column shows details like:

* Event Name
* Event Dates
* Event Venue

Additional cards may be used for similar information like contacts, vendors, workflows, etc.

**Contacts and Workflows always live in the left column** across every detail page that has them (orders, functions, etc.). They are the last two cards in the left column, in that order, with Workflows at the bottom and Contacts directly above it. Model-specific cards appear above this pair.

#### Right Column
The right column should be used for more dynamic "working" content. An example here is the SetupOrder model, where the right column shows details like:

* Table/Chair Setup Table
* Equipment Table

For models with significant volumes of information, it may be more appropriate to display summaries here with links to quickly access dedicated tabs with more tabular layouts.

### Bottom Table
If a tabular design is used, it should be linked from the top of the screen and reserved for high-importance information that can only usefully be shown in a tabular layout. An example here is the function list on the Event Overview screen.

## Order Model Layout

All order-type models (AVOrder, CateringOrder, SetupOrder) follow a shared layout convention.

### Header
The page header shows: record name, entity status badge (Pending / In Progress / Complete / Cancelled), and workflow progress badge. The status badge is a small color-coded pill using the same color conventions as workflow status.

### Left Column (col-span-1)
- **Details Card**: Name, Status (interactive EntityStatusPanel), Notes, Vendor(s)
- **Linked Function(s) card**: Functions associated with this order; rendered as a standalone card, not embedded inside the Details Card
- **Contacts card** (when the order type supports order-level contacts): positioned directly above the Workflows card
- **Workflows card**: Workflow instances with step/checklist progress

Model-specific additions to the left column (e.g., Linked Presentation for AVOrder, Guest Counts for CateringOrder) appear below the Linked Function(s) card and above the Contacts/Workflows pair. See "Standard Page Layout > Left Column" for the cross-cutting Contacts/Workflows rule.

### Right Column (col-span-2)
Model-specific working content. See each model's section under Critical Information for specifics.

### Vendors and Files Tabs
Full-width layout — no two-column split. Do not apply `max-w-2xl` or similar constraints.

## Tabs

Most detail pages use tabs to organize content. Standard tabs that appear on most models are:

* **Overview** — always first; uses the two-column layout described above
* **Vendors/Contacts** — vendor and contact assignments for the record
* **Files** — uploaded files and attachments

Model-specific tabs follow these, ordered by operational importance. For example, on a Catering Order the menu and day-of timeline tabs take priority over a pricing table.

## Cards

Cards are the primary grouping unit within a column. Conventions:

* **Header actions**: Buttons to add or manage items (e.g., "Add Contact") belong in the card header to keep the layout compact.
* **Empty state**: Cards with no data should display a subtle "None added" message to confirm no data exists rather than appearing blank.
* **No count badges**: Count badges in card headers add visual noise without enough utility for overview contexts — omit them.
* **Inline creation forms**: Forms to create new records should keep the user on the current page (e.g., an inline form that expands within the card), following the pattern established by the function contact panel. Avoid navigating away to a separate create page.
* **No single-field cards**: Avoid cards that contain only one field; merge them with a related card unless there is a clear reason to separate them.

## Editing

Detail pages load in read-only mode. An Edit button in the relevant card or section reveals an inline edit form. This applies to most fields. Dedicated edit pages are acceptable only when the edit form is complex enough that inline presentation would be unwieldy.

## Destructive Actions

Delete and other irreversible actions use an inline two-step confirmation: clicking the initial button replaces it in-place with an "Are you sure?" prompt alongside Confirm and Cancel buttons. Do not use browser `confirm()` dialogs. This keeps the interaction in context and avoids interrupting the user with a modal overlay for routine deletions.

## List Pages

Clicking a row navigates to the detail page for that record. Separate detail links are not needed.

When a list has no items, display a card-wrapped empty state (white/gray-800 card, centered text) rather than blank space. This confirms to the user that no data exists, as opposed to a loading failure.

## Workflow Status

Workflow is the primary status signal across all models and is displayed as a badge in the page header.

### Status Colors
| Status | Color |
|--------|-------|
| Not started | Gray |
| In progress | Yellow |
| Done | Green |
| Overdue | Red |

### Workflow Model
Workflows are hierarchical: a **WorkflowTemplate** contains sequential **Steps**, and each step may optionally contain **ChecklistItems**. Multiple workflows can be assigned to a single record via **WorkflowInstances**.

The header badge shows a compact summary (e.g., "3/5" or "Done"). Full step and checklist detail should be accessible inline without leaving the page — via an expandable section or popover — rather than requiring navigation elsewhere.

## Color Conventions

* **Workflow status**: See status color table above.
* **Function types**: Color-coded using the color field on the `function_type` CustomOption. These colors should be used consistently wherever function types are displayed (badges, calendar cells, list rows, etc.).
* **Dark mode**: Supported as a secondary concern. Light mode is the design baseline.

## Critical Information per Model

The following information is important to surface on overview pages. Consider displaying information not listed here on additional tabs or cards placed lower on the screen.

### Event Model
* Event Name
* Event Dates
* Event Venue
* Event Vendors
* Workflow

### Venue Model
* Venue Name
* Address
* Contacts

### Function Model
Critical info varies by function subtype, but the following apply to all functions:

* Name
* Type (color-coded)
* Room Assignment
* Date/Time Schedule
* Contacts
* Workflow
* Linked Orders (Catering, Setup, A/V) — summary with link to each

For function subtypes with minimal bespoke data (e.g., office, registration, exhibits), the linked orders surface most of the working detail. For subtypes with richer bespoke structure (e.g., Breakout sessions), the overview should surface subtype-specific fields and the layout may differ from the standard two-column model.

#### Layout
- **Left column**: Details Card (name, type, room, schedule fields), Contacts card, Workflows card
- **Right column**: Schedule list, then linked-order panels (AV, Catering, Setup, Print, Media)

### Presentation Model
* Presentation Title
* Presentation Type
  * If Breakout Type:
    * Breakout Group
  * If Plenary Type:
    * Assigned Plenary Function
* Speakers
* Workflow

### A/V Order Model
* Name
* Linked Function
* Workflow
* Vendor
* Equipment Summary

#### Layout
- **Left column**: Details Card (name, notes, vendor), Linked Function(s) card, Linked Presentation card, Workflows card
- **Right column**: Equipment card

### Catering Order Model
* Name
* Linked Function
* Workflow
* Vendor
* Service Style
* Guest Counts
* Contacts
* Menu

#### Layout
- **Left column**: Details Card (name, service style, notes, vendor), Guest Counts card (expected, confirmed, guarantee), Linked Function(s) card, Contacts card, Workflows card
- **Right column**: Timeline summary card (read-only summary; edit on Service tab), Menu card

#### Tab Order
Overview → Service → Contract & Billing → Vendors → Files

### Setup Order Model
* Name
* Linked Function
* Workflow
* Vendor
* Equipment Summary

#### Layout
- **Left column**: Details Card (name, room, setup type, notes, vendor), Linked Function(s) card, Workflows card
- **Right column**: Table/Chair Setup card, Equipment card

## Create Forms

When creating a new order record, the create form should include a standard set of fields. Fields not listed here (e.g., contacts) require an existing record ID and are deferred to the detail page after creation.

### Standard fields (all order types)
* **Name** — required, free text
* **Notes** — optional textarea for any relevant notes
* **Vendor** — optional; picker pre-filtered to the model type; defaults may be auto-applied server-side
* **Function** — optional selector for linking to an existing event function at creation time; only shown when unlinked functions exist for the event
* **Workflows** — auto-assigned server-side from defaults; no UI field on the create form

### CateringOrder additions
* **Service Style** — optional; select from custom options
* **Guest Counts** — Expected, Confirmed, Guarantee (optional numeric fields)

### SetupOrder additions
* **Room** — required; determines the setup order's display name (no separate name field)
* **Setup Type** — optional; select from custom options

### AVOrder additions
* **Linked Presentation** — optional; selector for associating with a presentation at creation time
